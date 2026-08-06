// ===== v199: reply action bar helpers (⋮ convert menu) =====
function msgDownloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function msgEscapeHtml(str){
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function exportReplyAsPdf(text){
  const w = window.open('', '_blank');
  if(!w) return;
  const html = '<html><head><meta charset="utf-8"><title>عمران AI</title><style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;padding:28px;line-height:2;color:#111;white-space:pre-wrap;word-break:break-word;}</style></head><body>' + msgEscapeHtml(text) + '</body></html>';
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try{ w.focus(); w.print(); }catch(e){ __swallow(e, "ui:app-05-ui#1"); } }, 350);
}
function exportReplyAsWord(text){
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>عمران AI</title></head><body dir="rtl" style="font-family:Tahoma,Arial,sans-serif; line-height:2; white-space:pre-wrap;">' + msgEscapeHtml(text) + '</body></html>';
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  msgDownloadBlob(blob, 'omran-ai-reply.doc');
}
function exportReplyAsImage(text){
  const width = 900;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const padding = 40;
  const fontSize = 22;
  ctx.font = fontSize + 'px Tahoma, Arial, sans-serif';
  const maxWidth = width - 2 * padding;
  const lines = [];
  String(text || '').split('\n').forEach(paragraph => {
    const words = paragraph.split(' ');
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = word; }
      else line = test;
    });
    lines.push(line);
  });
  const lineHeight = Math.round(fontSize * 1.55);
  canvas.width = width;
  canvas.height = padding * 2 + lines.length * lineHeight;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = fontSize + 'px Tahoma, Arial, sans-serif';
  lines.forEach((line, i) => { ctx.fillText(line, canvas.width - padding, padding + (i + 1) * lineHeight - Math.round(fontSize * 0.4)); });
  canvas.toBlob(blob => { if(blob) msgDownloadBlob(blob, 'omran-ai-reply.png'); }, 'image/png');
}
function exportReplyAsTxt(text){
  const blob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' });
  msgDownloadBlob(blob, 'omran-ai-reply.txt');
}
let __msgMoreMenuOpen = null;
function closeMsgMoreMenu(){
  if(__msgMoreMenuOpen){ __msgMoreMenuOpen.remove(); __msgMoreMenuOpen = null; }
}
document.addEventListener('click', closeMsgMoreMenu);
// ✨ v363: قدرات التطبيق داخل المحادثة نفسها — أيقونة سريعة تحت كل رد
// + ملاحظة تلقائية تقترح الميزة المناسبة. الأزرار القديمة في ⋮ تبقى كما هي؛
// هذا باب إضافي (المكانين) عشان المستخدم يختار اللي يريحه.
var APP_CAPABILITIES = [
  { id:'btnCV',       icon:'💼', ar:'مولّد السيرة الذاتية', en:'CV Builder',
    kw:/(سيرة ذاتية|سيره ذاتيه|سي\s?في|resume|\bcv\b|خطاب تقديم|cover letter)/i },
  { id:'btnDocs',     icon:'📄', ar:'مساعد المستندات', en:'Document Assistant',
    kw:/(?:حلل|حلّل|اقرأ|افهم|لخص|لخّص|راجع|افحص).{0,18}(?:مستند|عقد|فاتورة|تقرير|ملف|اتفاقية|pdf)|(?:مستند|عقد|فاتورة|اتفاقية|contract|invoice)\b/i },
  { id:'btnGov',      icon:'🧾', ar:'المعاملات الحكومية', en:'Government Services',
    kw:/(إقامة|اقامة|رخصة تجارية|رخصه|تجديد.{0,10}(هوية|جواز|رخصة|إقامة)|تأشيرة|تاشيرة|فيزا|بلدية|معاملة حكوم|خدمة حكوم|residence visa|business license|govern)/i },
  { id:'btnReligion', icon:'☪️', ar:'التفسير الديني', en:'Religious Guidance',
    kw:/(ما\s?حكم|وش\s?حكم|شو\s?حكم|فتوى|حلال\s?أو?\s?حرام|تفسير\s?(آية|اية|سورة)|معنى\s?الحديث|fatwa|is it halal|is it haram)/i },
];
// ميزة الشخصية الكرتونية الناطقة = من الدردشة (صورة + «سوِّ منها شخصية تتكلم»)
function startTalkingCharFlow(){
  try{
    var p = document.getElementById('prompt');
    if(p){
      var isEn = (typeof lang!=='undefined' && lang==='en');
      p.value = isEn ? 'Turn my photo into a talking cartoon character that says: '
                     : 'حوّل صورتي لشخصية كرتونية تتكلم وتقول: ';
      p.focus();
      try{ p.setSelectionRange(p.value.length, p.value.length); }catch(_){ __swallow(_, "ui:app-05-ui#2"); }
    }
    if(typeof settingsToast==='function') settingsToast((typeof lang!=='undefined'&&lang==='en')?'📎 Attach your photo, then send.':'📎 أرفق صورتك ثم أرسل.');
  }catch(e){ __swallow(e, "upload:app-05-ui#3"); }
}
function openFeatureById(id){
  if(id==='__talk'){ startTalkingCharFlow(); return; }
  try{ var b=document.getElementById(id); if(b) b.click(); }catch(e){ __swallow(e, "upload:app-05-ui#4"); }
}
// ملاحظة تلقائية: تفحص رسالة المستخدم السابقة وترجّع الميزة المناسبة (أو null)
function capabilityHintFor(userText){
  if(!userText) return null;
  var s = String(userText);
  for(var i=0;i<APP_CAPABILITIES.length;i++){
    if(APP_CAPABILITIES[i].kw.test(s)) return APP_CAPABILITIES[i];
  }
  return null;
}
// أيقونة القدرات ✨ تحت الرد → قائمة صغيرة بكل الميزات
function openCapabilitiesMenu(anchorBtn){
  closeMsgMoreMenu();
  var isEn = (typeof lang!=='undefined' && lang==='en');
  var menu = document.createElement('div');
  menu.className = 'msgMoreMenu';
  var list = APP_CAPABILITIES.map(function(c){ return { icon:c.icon, label:(isEn?c.en:c.ar), id:c.id }; });
  list.push({ icon:'🎬', label:(isEn?'Talking character':'شخصية تتكلم'), id:'__talk' });
  list.forEach(function(it){
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.icon + '  ' + it.label;
    b.onclick = function(e){ e.stopPropagation(); openFeatureById(it.id); closeMsgMoreMenu(); };
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  var rect = anchorBtn.getBoundingClientRect();
  var menuW = menu.offsetWidth || 190;
  var menuH = menu.offsetHeight || 220;
  var left = rect.left + window.scrollX;
  if(left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
  menu.style.left = Math.max(8, left) + 'px';
  var top = rect.top + window.scrollY - menuH - 6;
  if(top < window.scrollY + 8) top = rect.bottom + window.scrollY + 4;
  menu.style.top = top + 'px';
  __msgMoreMenuOpen = menu;
}

function openMsgMoreMenu(anchorBtn, text){
  closeMsgMoreMenu();
  const menu = document.createElement('div');
  menu.className = 'msgMoreMenu';
  const items = [
    { label: t('convertToPdf') || 'تحويل إلى PDF', fn: () => exportReplyAsPdf(text) },
    { label: t('convertToWord') || 'تحويل إلى Word', fn: () => exportReplyAsWord(text) },
    { label: t('convertToImage') || 'تحويل إلى صورة', fn: () => exportReplyAsImage(text) },
    { label: t('downloadTxt') || 'تنزيل نص TXT', fn: () => exportReplyAsTxt(text) },
  ];
  items.forEach(it => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = it.label;
    b.onclick = (e) => { e.stopPropagation(); it.fn(); closeMsgMoreMenu(); };
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  const rect = anchorBtn.getBoundingClientRect();
  const menuW = menu.offsetWidth || 170;
  const menuH = menu.offsetHeight || 180;
  let left = rect.left + window.scrollX;
  if(left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
  menu.style.left = Math.max(8, left) + 'px';
  let top = rect.top + window.scrollY - menuH - 6;
  if(top < window.scrollY + 8) top = rect.bottom + window.scrollY + 4;
  menu.style.top = top + 'px';
  __msgMoreMenuOpen = menu;
}

function renderCodeAndPreview(){
  const cur = getCurrent();
  const pyConsole = $('#pyConsole');
  if(!cur || !cur.code){
    if(previewFrame._imageView){
      pyConsole.style.display = 'none';
      previewFrame.style.display = 'block';
      emptyState.style.display = 'none';
      codeEl.value = '';
      return;
    }
    codeEl.value = '';
    previewFrame.style.display = 'none';
    pyConsole.style.display = 'none';
    emptyState.style.display = 'flex';
    const spinnerEl = $('#emptyStateSpinner');
    const titleEl = $('#emptyTitleEl');
    const descEl = $('#emptyDescEl');
    if(typeof genAbortController !== 'undefined' && genAbortController){
      spinnerEl.style.display = 'block';
      titleEl.textContent = t('generatingInProgressTitle');
      descEl.innerHTML = t('generatingInProgressDesc');
    } else {
      spinnerEl.style.display = 'none';
      titleEl.textContent = t('emptyTitle');
      descEl.innerHTML = t('emptyDesc');
    }
    return;
  }
  codeEl.value = cur.code;
  emptyState.style.display = 'none';
  if(cur.codeType === 'python'){
    previewFrame.style.display = 'none';
    pyConsole.style.display = 'flex';
    if(pyConsole._lastCode !== cur.code){
      pyConsole._lastCode = cur.code;
      $('#pyOutput').textContent = '';
      $('#pyStatus').textContent = '';
      runPythonCode(cur.code);
    }
  } else {
    pyConsole.style.display = 'none';
    previewFrame.style.display = 'block';
    if(previewFrame._lastSrc !== cur.code){
      previewFrame._lastSrc = cur.code;
      previewFrame._imageView = false;
      previewFrame.srcdoc = cur.code;
    }
  }
}

let pyodideInstance = null;
let pyodideLoadingPromise = null;
async function getPyodideInstance(){
  if(pyodideInstance) return pyodideInstance;
  if(!pyodideLoadingPromise){
    $('#pyStatus').textContent = t('pythonLoadingRuntime');
    pyodideLoadingPromise = (async () => {
      if(!window.loadPyodide){
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const inst = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
      pyodideInstance = inst;
      return inst;
    })();
  }
  return pyodideLoadingPromise;
}

async function runPythonCode(code){
  const outputEl = $('#pyOutput');
  const statusEl = $('#pyStatus');
  const runBtn = $('#btnRunPython');
  runBtn.disabled = true;
  outputEl.textContent = '';
  try{
    const py = await getPyodideInstance();
    statusEl.textContent = t('pythonRunning');
    py.setStdout({ batched: (s) => { outputEl.textContent += s + '\n'; outputEl.scrollTop = outputEl.scrollHeight; } });
    py.setStderr({ batched: (s) => { outputEl.textContent += s + '\n'; outputEl.scrollTop = outputEl.scrollHeight; } });
    await py.runPythonAsync(code);
    statusEl.textContent = t('pythonDone');
  }catch(err){
    outputEl.textContent += '\n⚠️ ' + (err.message || err);
    statusEl.textContent = t('pythonError');
  }finally{
    runBtn.disabled = false;
  }
}

function renderAll(keepScroll){
  renderHistory();
  renderMessages(keepScroll);
  renderCodeAndPreview();
}

$('#btnNew').onclick = () => {
  const id = 'p_' + Date.now();
  state.projects.push({id, title: t('defaultProjectTitle'), messages: [], code: ''});
  state.currentId = id;
  saveState();
  renderAll();
  // مشروع جديد فعليًا => امسح مرجع صورة مها الأخيرة
  if(typeof mahaClearImageRef === 'function') mahaClearImageRef();
};

$('#btnDeleteAll').onclick = () => {
  if(!confirm(t('confirmDeleteAll'))) return;
  // v381: حذف كل المحادثات عبر chats_delete (tombstone) — ما يمسح السيرفر بالكامل.
  const __allIds = state.projects.map(p => p.id).filter(Boolean);
  try{ __allIds.forEach(id => { if(window.chatsMarkDeleted) chatsMarkDeleted(id); }); }catch(err){ __swallow(err, "misc:app-05-ui#5"); }
  state.projects = [];
  const id = 'p_' + Date.now();
  state.projects.push({id, title: t('defaultProjectTitle'), messages: [], code: ''});
  state.currentId = id;
  if(typeof mahaClearImageRef === 'function') mahaClearImageRef();
  saveState();
  try{
    const tok = (typeof chatsAuthToken === 'function') ? chatsAuthToken() : '';
    if(tok && __allIds.length){
      fetch('/api/account?action=chats_delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok, ids: __allIds }),
      }).catch(() => {});
    }
  }catch(err){ __swallow(err, "misc:app-05-ui#6"); }
  renderAll();
};

/* v243: 💜 رأيك يهمنا — نافذة تقييم فاخرة */
(function(){
  const css = document.createElement('style');
  css.textContent = `
#fbOverlay{position:fixed;inset:0;z-index:10050;display:none;align-items:center;justify-content:center;background:rgba(8,6,20,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:16px;}
#fbOverlay.open{display:flex;animation:fbFade .3s ease;}
@keyframes fbFade{from{opacity:0}to{opacity:1}}
#fbCard{position:relative;width:100%;max-width:420px;max-height:92vh;overflow-y:auto;border-radius:28px;padding:2px;background:conic-gradient(from var(--fbAng,0deg),var(--accent,#d4af37),#06b6d4,#f59e0b,#ec4899,var(--accent,#d4af37));animation:fbSpin 5s linear infinite,fbPop .45s cubic-bezier(.2,1.4,.4,1);}
@property --fbAng{syntax:'<angle>';initial-value:0deg;inherits:false;}
@keyframes fbSpin{to{--fbAng:360deg}}
@keyframes fbPop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
#fbInner{border-radius:26px;background:linear-gradient(160deg,rgba(22,18,42,.98),rgba(10,8,24,.98));padding:28px 24px 24px;text-align:center;position:relative;overflow:hidden;}
#fbInner::before{content:'';position:absolute;top:-70px;right:-70px;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent,#d4af37) 32%,transparent),transparent 70%);pointer-events:none;}
#fbInner::after{content:'';position:absolute;bottom:-80px;left:-60px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(6,182,212,.18),transparent 70%);pointer-events:none;}
#fbHeart{width:64px;height:64px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent,#d4af37),#ec4899);box-shadow:0 0 32px color-mix(in srgb,var(--accent,#d4af37) 55%,transparent);animation:fbBeat 1.6s ease-in-out infinite;}
@keyframes fbBeat{0%,100%{transform:scale(1)}12%{transform:scale(1.12)}24%{transform:scale(1)}36%{transform:scale(1.08)}48%{transform:scale(1)}}
#fbTitle{font-size:21px;font-weight:700;background:linear-gradient(90deg,#fff,color-mix(in srgb,var(--accent,#d4af37) 60%,#fff));-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:4px;}
#fbSub{font-size:13px;color:var(--muted,#9aa);margin-bottom:18px;}
#fbStars{display:flex;justify-content:center;gap:8px;margin-bottom:18px;direction:ltr;}
.fbStar{width:42px;height:42px;cursor:pointer;transition:transform .18s;fill:none;stroke:#4b476b;stroke-width:1.6;}
.fbStar:hover{transform:scale(1.22) rotate(-8deg);}
.fbStar.on{fill:url(#fbGold);stroke:#f5b942;filter:drop-shadow(0 0 8px rgba(245,185,66,.65));animation:fbStarPop .35s cubic-bezier(.2,1.6,.4,1);}
@keyframes fbStarPop{50%{transform:scale(1.35)}}
#fbChips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:16px;}
.fbChip{padding:7px 14px;border-radius:999px;font-size:12.5px;cursor:pointer;color:#cfcbe8;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);transition:all .2s;user-select:none;}
.fbChip.on{background:linear-gradient(135deg,var(--accent,#d4af37),#ec4899);border-color:transparent;color:#fff;box-shadow:0 4px 14px color-mix(in srgb,var(--accent,#d4af37) 45%,transparent);transform:translateY(-1px);}
#fbNote{width:100%;min-height:72px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#eee;font-size:13.5px;padding:12px;resize:none;outline:none;margin-bottom:16px;font-family:inherit;}
#fbNote:focus{border-color:var(--accent,#d4af37);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#d4af37) 22%,transparent);}
#fbSendBtn{width:100%;padding:13px;border:none;border-radius:14px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(135deg,var(--accent,#d4af37),#ec4899);position:relative;overflow:hidden;transition:transform .15s,box-shadow .2s;}
#fbSendBtn:hover{transform:translateY(-2px);box-shadow:0 8px 24px color-mix(in srgb,var(--accent,#d4af37) 50%,transparent);}
#fbSendBtn::after{content:'';position:absolute;top:0;left:-80%;width:50%;height:100%;background:linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent);animation:fbShine 2.8s ease-in-out infinite;}
@keyframes fbShine{0%,60%{left:-80%}100%{left:130%}}
#fbClose{position:absolute;top:14px;inset-inline-end:14px;width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:#bbb;font-size:16px;cursor:pointer;z-index:2;}
#fbClose:hover{background:rgba(255,255,255,.16);color:#fff;}
#fbThanksView{display:none;padding:22px 0 10px;}
#fbCheck{width:84px;height:84px;margin:0 auto 16px;}
#fbCheck circle{stroke:#22c55e;stroke-width:2.4;fill:none;stroke-dasharray:245;stroke-dashoffset:245;animation:fbDraw .7s ease forwards;}
#fbCheck path{stroke:#22c55e;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:fbDraw .5s .5s ease forwards;}
@keyframes fbDraw{to{stroke-dashoffset:0}}
.fbConf{position:absolute;top:38%;left:50%;width:9px;height:9px;border-radius:2px;opacity:0;pointer-events:none;animation:fbConf 1.3s ease-out forwards;}
@keyframes fbConf{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(var(--cx),var(--cy)) rotate(540deg)}}
#fbOwnerBtn{margin-top:14px;background:none;border:none;color:var(--muted,#99a);font-size:12px;cursor:pointer;text-decoration:underline;position:relative;z-index:2;}
#fbList{display:none;text-align:start;max-height:52vh;overflow-y:auto;position:relative;z-index:2;}
.fbItem{padding:12px 4px;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px;color:#ddd;}
.fbItem .fbStarsSm{color:#f5b942;font-size:13px;letter-spacing:2px;direction:ltr;display:inline-block;}
.fbItem .fbMeta{font-size:11px;color:var(--muted,#889);margin-top:3px;}
@media(max-width:520px){#fbCard{max-width:96vw;}#fbStars .fbStar{width:38px;height:38px;}}
`;
  document.head.appendChild(css);

  const wrap = document.createElement('div');
  wrap.id = 'fbOverlay';
  wrap.innerHTML = `
  <div id="fbCard"><div id="fbInner">
    <button id="fbClose" type="button">✕</button>
    <svg width="0" height="0" style="position:absolute;"><defs><linearGradient id="fbGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe08a"/><stop offset="100%" stop-color="#f5a623"/></linearGradient></defs></svg>
    <div id="fbFormView">
      <div id="fbHeart"><svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
      <div id="fbTitle"></div>
      <div id="fbSub"></div>
      <div id="fbStars"></div>
      <div id="fbChips"></div>
      <textarea id="fbNote"></textarea>
      <button id="fbSendBtn" type="button"></button>
      <button id="fbOwnerBtn" type="button" style="display:none;"></button>
    </div>
    <div id="fbThanksView">
      <svg id="fbCheck" viewBox="0 0 90 90"><circle cx="45" cy="45" r="39"/><path d="M28 46 l12 12 l22 -24"/></svg>
      <div id="fbThanksT" style="font-size:19px;font-weight:700;color:#fff;margin-bottom:6px;"></div>
      <div id="fbThanksS" style="font-size:13px;color:var(--muted,#9aa);"></div>
    </div>
    <div id="fbList"></div>
  </div></div>`;
  document.body.appendChild(wrap);

  let fbRating = 0;
  const fbChipKeys = ['fbChipEasy','fbChipDesign','fbChipAI','fbChipSlow','fbChipBug'];
  const starSvg = '<svg class="fbStar" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  function fbIsOwner(){
    try{ return String((typeof authGet==='function'&&authGet('aiapp_username'))||'').trim().toLowerCase()==='omran'; }catch(_){ return false; }
  }

  function fbBuild(){
    document.getElementById('fbTitle').textContent = t('fbTitle');
    document.getElementById('fbSub').textContent = t('fbSubtitle');
    document.getElementById('fbNote').placeholder = t('fbNotePh');
    document.getElementById('fbSendBtn').textContent = t('fbSend');
    const stars = document.getElementById('fbStars');
    stars.innerHTML = starSvg.repeat(5);
    [...stars.children].forEach((s,i)=>{
      s.onclick = ()=>{ fbRating = i+1; [...stars.children].forEach((x,j)=>x.classList.toggle('on', j<fbRating)); };
    });
    const chips = document.getElementById('fbChips');
    chips.innerHTML = '';
    fbChipKeys.forEach(k=>{
      const c = document.createElement('span');
      c.className = 'fbChip'; c.dataset.k = k; c.textContent = t(k);
      c.onclick = ()=>c.classList.toggle('on');
      chips.appendChild(c);
    });
    const ob = document.getElementById('fbOwnerBtn');
    if(fbIsOwner()){ ob.style.display='inline-block'; ob.textContent = t('fbOwnerList'); }
  }

  window.openFeedback = function(){
    fbRating = 0;
    fbBuild();
    document.getElementById('fbFormView').style.display='block';
    document.getElementById('fbThanksView').style.display='none';
    document.getElementById('fbList').style.display='none';
    document.getElementById('fbNote').value='';
    wrap.classList.add('open');
  };
  document.getElementById('fbClose').onclick = ()=>wrap.classList.remove('open');
  wrap.onclick = (e)=>{ if(e.target===wrap) wrap.classList.remove('open'); };

  document.getElementById('fbSendBtn').onclick = async ()=>{
    if(!fbRating){ document.getElementById('fbStars').style.animation='fbStarPop .35s'; setTimeout(()=>document.getElementById('fbStars').style.animation='',400); return; }
    const chips = [...document.querySelectorAll('#fbChips .fbChip.on')].map(c=>c.dataset.k);
    const note = document.getElementById('fbNote').value.trim();
    let user='guest'; try{ user = (typeof authGet==='function'&&authGet('aiapp_username'))||'guest'; }catch(_){ __swallow(_, "misc:app-05-ui#7"); }
    try{
      fetch('/api/system?action=feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:fbRating,chips,note,user,lang:(typeof lang!=='undefined'?lang:'')})});
    }catch(_){ __swallow(_, "misc:app-05-ui#8"); }
    localStorage.setItem('fbDone','1');
    document.getElementById('fbFormView').style.display='none';
    const tv = document.getElementById('fbThanksView');
    tv.style.display='block';
    document.getElementById('fbThanksT').textContent = t('fbThanks');
    document.getElementById('fbThanksS').textContent = t('fbThanksSub');
    const colors=['#d4af37','#ec4899','#f5b942','#22c55e','#06b6d4'];
    for(let i=0;i<26;i++){
      const p=document.createElement('span'); p.className='fbConf';
      p.style.background=colors[i%colors.length];
      p.style.setProperty('--cx',(Math.random()*320-160)+'px');
      p.style.setProperty('--cy',(Math.random()*300-200)+'px');
      p.style.animationDelay=(Math.random()*.25)+'s';
      document.getElementById('fbInner').appendChild(p);
      setTimeout(()=>p.remove(),1800);
    }
    setTimeout(()=>wrap.classList.remove('open'),2600);
  };

  document.getElementById('fbOwnerBtn').onclick = async ()=>{
    const list = document.getElementById('fbList');
    document.getElementById('fbFormView').style.display='none';
    list.style.display='block';
    list.innerHTML = '<div style="text-align:center;color:#889;padding:20px;">…</div>';
    try{
      const r = await fetch('/api/system?action=feedback&token=' + (typeof ownerToken === 'function' ? ownerToken() : '') + '',{cache:'no-store'});
      const d = await r.json();
      const items = (d&&d.feedback)||[];
      const reports = (d&&d.reports)||[];
      if(!items.length && !reports.length){ list.innerHTML = '<div style="text-align:center;color:#889;padding:20px;">'+t('fbEmpty')+'</div>'; return; }
      let html = items.map(it=>{
        const stars='★'.repeat(it.rating)+'☆'.repeat(5-it.rating);
        const chips=(it.chips||[]).map(k=>t(k)).join(' · ');
        return '<div class="fbItem"><span class="fbStarsSm">'+stars+'</span>'+(chips?' — '+chips:'')+(it.note?'<div style="margin-top:4px;">'+it.note.replace(/</g,'&lt;')+'</div>':'')+'<div class="fbMeta">'+(it.user||'guest')+' · '+String(it.ts||'').slice(0,16).replace('T',' ')+'</div></div>';
      }).join('');
      if(reports.length){
        html += '<div style="margin:14px 0 6px;font-weight:700;color:#ff5c6c;">🚩 بلاغات المحتوى ('+reports.length+')</div>';
        html += reports.map(rp=>'<div class="fbItem" style="border-color:rgba(255,92,108,.35);"><div style="white-space:pre-wrap;word-break:break-word;">'+String(rp.content||'').slice(0,300).replace(/</g,'&lt;')+'</div><div class="fbMeta">'+(rp.user||'guest')+(rp.provider?' · '+rp.provider:'')+' · '+String(rp.ts||'').slice(0,16).replace('T',' ')+'</div></div>').join('');
      }
      list.innerHTML = html;
    }catch(e){ list.innerHTML = '<div style="text-align:center;color:#e66;padding:20px;">⚠️</div>'; }
  };

  const fbBtn = document.getElementById('btnFeedback');
  if(fbBtn) fbBtn.onclick = (e)=>{ e.stopPropagation(); try{document.getElementById('plusToolsPopup').classList.remove('open');}catch(_){ __swallow(_, "ui:app-05-ui#9"); } window.openFeedback(); };

  // عرض ذكي مرة واحدة بعد 10 رسائل ناجحة
  window.__fbCountMsg = function(){
    try{
      if(localStorage.getItem('fbDone') || localStorage.getItem('fbAsked')) return;
      const n = (parseInt(localStorage.getItem('fbMsgCount')||'0',10)||0)+1;
      localStorage.setItem('fbMsgCount', String(n));
      if(n>=10){ localStorage.setItem('fbAsked','1'); setTimeout(()=>window.openFeedback(),1500); }
    }catch(_){ __swallow(_, "save:app-05-ui#10"); }
  };
})();

/* v315: 📄 تحويل آخر رد إلى PDF — من قائمة ⋮ في مربع الكتابة */
(function(){
  const b = document.getElementById('btnChatToPdf');
  if(!b) return;
  b.onclick = (e) => {
    e.stopPropagation();
    try{ document.getElementById('plusToolsPopup').classList.remove('open'); }catch(_){ __swallow(_, "ui:app-05-ui#11"); }
    const cur = state.projects.find(p => p.id === state.currentId);
    let src = null;
    if(cur && cur.messages){
      for(let i = cur.messages.length - 1; i >= 0; i--){
        const m = cur.messages[i];
        if(m.role !== 'user' && m.content && !m._loading && String(m.content).trim().length > 20){ src = String(m.content); break; }
      }
    }
    if(!src){ alert(t('chatToPdfEmpty') || 'لا يوجد رد لتحويله بعد.'); return; }
    exportTextAsPdf(src);
  };
})();

/* v225: 🗑️ حذف المحادثة الحالية فقط — من قائمة ⋮ في مربع الكتابة */
(function(){
  const b = document.getElementById('btnDeleteChat');
  if(!b) return;
  b.onclick = (e) => {
    e.stopPropagation();
    if(!confirm(t('confirmDeleteChat'))) return;
    const __delId = state.currentId;
    try{ if(window.chatsMarkDeleted) chatsMarkDeleted(__delId); }catch(err){ __swallow(err, "misc:app-05-ui#12"); }
    state.projects = state.projects.filter(p => p.id !== __delId);
    if(!state.projects.length){
      state.projects.push({id: 'p_' + Date.now(), title: t('defaultProjectTitle'), messages: [], code: ''});
    }
    state.currentId = state.projects[state.projects.length - 1].id;
    if(typeof mahaClearImageRef === 'function') mahaClearImageRef();
    saveState();
    // v381: حذف من السيرفر بـ tombstone — لا يرجع أبدًا من أي جهاز.
    try{
      const tok = (typeof chatsAuthToken === 'function') ? chatsAuthToken() : '';
      if(tok){
        fetch('/api/account?action=chats_delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tok, ids: [__delId] }),
        }).catch(() => {});
      }
    }catch(err){ __swallow(err, "misc:app-05-ui#13"); }
    renderAll();
    setTimeout(() => { const p = document.getElementById('plusToolsPopup'); if(p) p.classList.remove('show'); }, 150);
  };
})();

/* ---------- v214: قائمة المشاريع المطوية (مشروع جديد / بحث عن مشروع / حذف الكل) ---------- */
(function(){
  const toggle = document.getElementById('btnProjMenuToggle');
  const panel = document.getElementById('projMenuPanel');
  const chev = document.getElementById('projMenuChevron');
  const searchBtn = document.getElementById('btnProjSearch');
  const searchInput = document.getElementById('projSearchInput');
  if(!toggle || !panel) return;
  toggle.onclick = (e) => {
    e.stopPropagation();
    const open = panel.style.display !== 'flex';
    panel.style.display = open ? 'flex' : 'none';
    if(chev) chev.style.transform = open ? 'rotate(180deg)' : '';
    if(!open && searchInput){ searchInput.style.display = 'none'; searchInput.value = ''; filterProjects(''); }
  };
  function filterProjects(q){
    const norm = String(q || '').trim().toLowerCase();
    document.querySelectorAll('#history .hist-item').forEach(item => {
      const title = (item.querySelector('.hist-title') || {}).textContent || '';
      item.style.display = (!norm || title.toLowerCase().includes(norm)) ? '' : 'none';
    });
  }
  if(searchBtn && searchInput){
    searchBtn.onclick = (e) => {
      e.stopPropagation();
      const show = searchInput.style.display === 'none' || !searchInput.style.display;
      searchInput.style.display = show ? 'block' : 'none';
      if(show){ searchInput.focus(); } else { searchInput.value = ''; filterProjects(''); }
    };
    searchInput.addEventListener('input', () => filterProjects(searchInput.value));
  }
  // الأسماء تتغير مع اللغة (بدون رموز)
  window.__refreshProjMenuLabels = function(){
    try{
      const clean = s => String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').replace(/^[+➕🗑️\s]+/u, '').trim();
      const bNew = document.getElementById('btnNew');
      const bDel = document.getElementById('btnDeleteAll');
      if(bNew) bNew.textContent = clean(t('newProject')) || 'مشروع جديد';
      if(bDel) bDel.textContent = clean(t('deleteAllProjects')) || 'حذف الكل';
      if(searchBtn) searchBtn.textContent = t('projSearchLabel') || 'بحث عن مشروع';
      if(searchInput) searchInput.placeholder = t('projSearchLabel') || 'بحث عن مشروع';
    }catch(_){ __swallow(_, "misc:app-05-ui#14"); }
  };
  window.__refreshProjMenuLabels();
})();

/* ---------- 🧩 Templates gallery ---------- */
(function(){
  const modal = $('#templatesModal');
  const grid = $('#templatesGrid');
  const previewWrap = $('#templatePreviewWrap');
  const previewFrame = $('#templatePreviewFrame');
  let pendingTpl = null;
  function currentLang(){ const L = (typeof lang !== 'undefined') ? lang : 'ar'; return ['ar','en','fr','hi','ur','bn','ne'].includes(L) ? L : 'en'; }
  function renderTemplates(){
    if(typeof TEMPLATES === 'undefined') return;
    const L = currentLang();
    grid.innerHTML = '';
    TEMPLATES.forEach(tpl => {
      const card = document.createElement('div');
      card.style.cssText = 'background:#161622; border:1px solid #262b36; border-radius:14px; padding:20px; text-align:center; cursor:pointer; transition:.15s;';
      card.onmouseenter = () => card.style.borderColor = 'var(--accent)';
      card.onmouseleave = () => card.style.borderColor = '#262b36';
      card.innerHTML = `
        <div style="font-size:36px; margin-bottom:10px;">${tpl.icon}</div>
        <div style="font-weight:700; font-size:15px; margin-bottom:6px;">${tpl.title[L]}</div>
        <div style="color:#a7adc0; font-size:12.5px; line-height:1.5;">${tpl.desc[L]}</div>
      `;
      card.onclick = () => showTemplatePreview(tpl);
      grid.appendChild(card);
    });
  }
  function showTemplatePreview(tpl){
    pendingTpl = tpl;
    previewFrame.srcdoc = tpl.code;
    grid.style.display = 'none';
    previewWrap.style.display = 'block';
  }
  function closeTemplatePreview(){
    pendingTpl = null;
    previewFrame.srcdoc = '';
    previewWrap.style.display = 'none';
    grid.style.display = 'grid';
  }
  function useTemplate(tpl){
    const L = currentLang();
    const id = 'p_' + Date.now();
    state.projects.push({id, title: tpl.title[L], messages: [], code: tpl.code});
    state.currentId = id;
    saveState();
    renderAll();
    closeTemplatePreview();
    modal.close();
  }
  $('#btnTemplates').onclick = () => { closeTemplatePreview(); renderTemplates(); modal.showModal(); if(typeof closeHeaderMenu === 'function') closeHeaderMenu(); };
  $('#btnCloseTemplates').onclick = () => { closeTemplatePreview(); modal.close(); };
  $('#btnClosePreviewTpl').onclick = () => closeTemplatePreview();
  $('#btnUseThisTemplate').onclick = () => { if(pendingTpl) useTemplate(pendingTpl); };
  modal.addEventListener('click', (e) => { if(e.target === modal){ closeTemplatePreview(); modal.close(); } });
})();

// tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('#panel-' + tab.dataset.tab).classList.add('active');
    if(tab.dataset.tab === 'voice' && typeof mahaStartCall === 'function' && !mahaCallActive){
      mahaStartCall('builder');
    }
  };
});

/* v338: حجم خط المحادثة */
(function(){
  function applyFS(v){
    document.documentElement.classList.remove('fs-small','fs-large','fs-xlarge');
    if(v && v !== 'normal') document.documentElement.classList.add('fs-' + v);
    document.querySelectorAll('.fontSizeBtn').forEach(b => b.classList.toggle('active', b.dataset.fs === v));
  }
  let saved = 'normal';
  try{ saved = localStorage.getItem('chatFontSize') || 'normal'; }catch(e){ __swallow(e, "ui:app-05-ui#15"); }
  applyFS(saved);
  document.querySelectorAll('.fontSizeBtn').forEach(b => {
    b.onclick = function(){
      try{ localStorage.setItem('chatFontSize', b.dataset.fs); }catch(e){ __swallow(e, "save:app-05-ui#16"); }
      applyFS(b.dataset.fs);
    };
  });
})();

/* v336: طي/فتح لوحة الكود والمعاينة (كمبيوتر فقط) */
(function(){
  const wa = document.getElementById('workarea');
  const rz = document.getElementById('resizer2');
  const tabs = document.getElementById('tabs');
  if(!wa || !tabs) return;
  const btn = document.createElement('button');
  btn.id = 'waCollapseBtn'; btn.type = 'button'; btn.setAttribute('aria-label','طي اللوحة');
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="15" y1="4" x2="15" y2="20"></line></svg>';
  tabs.insertBefore(btn, tabs.firstElementChild);
  const ro = document.createElement('button');
  ro.id = 'waReopen'; ro.type = 'button'; ro.setAttribute('aria-label','فتح اللوحة');
  ro.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  document.body.appendChild(ro);
  function setWA(collapsed){
    wa.classList.toggle('waCollapsed', collapsed);
    if(rz) rz.classList.toggle('waCollapsed', collapsed);
    document.body.classList.toggle('waCollapsedMode', collapsed);
    try{ localStorage.setItem('waCollapsed', collapsed ? '1' : '0'); }catch(e){ __swallow(e, "save:app-05-ui#17"); }
  }
  btn.onclick = () => setWA(true);
  ro.onclick = () => setWA(false);
  window.waAutoExpand = function(){ if(wa.classList.contains('waCollapsed')) setWA(false); };
  try{ if(localStorage.getItem('waCollapsed') === '1' && !document.documentElement.classList.contains('mobile-ui')) setWA(true); }catch(e){ __swallow(e, "ui:app-05-ui#18"); }
  // كود جديد يوصل → اللوحة تفتح تلقائيًا
  try{
    if(typeof renderCodeAndPreview === 'function'){
      const _rcp336 = renderCodeAndPreview;
      let _waLastCode = null;
      renderCodeAndPreview = function(){
        const r = _rcp336.apply(this, arguments);
        try{
          const cur = (typeof getCurrent === 'function') ? getCurrent() : null;
          const code = (cur && cur.code) || '';
          if(_waLastCode !== null && code && code !== _waLastCode && !document.documentElement.classList.contains('mobile-ui')) window.waAutoExpand();
          _waLastCode = code;
        }catch(e){ __swallow(e, "ui:app-05-ui#19"); }
        return r;
      };
    }
  }catch(e){ __swallow(e, "ui:app-05-ui#20"); }
})();

// ===== Theme & provider colors =====
const THEME_DEFAULTS = {
  accent: '#d4af37', text: '#eef0f6', bg: '#000000',
  userBubble: 'var(--accent)', assistantBubble: '#1e1e1e'
};
const PROVIDER_COLOR_DEFAULTS = {
  'OpenAI': '#10a37f',
  'Google Gemini': '#4285f4',
  'Groq': '#f55036',
  'Anthropic Claude': '#d97757',
  'OpenRouter': '#6467f2',
  'Perplexity': '#20808d',
  'Mistral AI': '#ff7000',
  'DeepSeek': '#4d6bfe',
  'Cohere': '#39594d'
};
// Maps the internal provider key (used in localStorage 'aiapp_provider' and
// callProviderAI) to the display label used as the key in PROVIDER_COLOR_DEFAULTS.
function providerPickToast(){
  try{
    const cur = getCurrent();
    const names = (cur && cur.continueProviders || []).map(k => PROVIDER_KEY_LABELS[k] || k);
    const ar = (localStorage.getItem('aiapp_lang') || 'ar') === 'ar';
    const msg = names.length
      ? (ar ? '✅ أسئلتك القادمة ستذهب إلى: ' + names.join('، ') + ' فقط' : '✅ Next questions go to: ' + names.join(', ') + ' only')
      : (ar ? '↩️ رجعنا للوضع الافتراضي' : '↩️ Back to default');
    let el = document.getElementById('provPickToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'provPickToast';
      el.style.cssText = 'position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:#1c2230; color:#fff; padding:10px 16px; border-radius:20px; font-size:13px; z-index:9999; box-shadow:0 4px 18px rgba(0,0,0,.4); transition:opacity .3s; max-width:90vw; text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }catch(e){ __swallow(e, "ui:app-05-ui#21"); }
}
const PROVIDER_KEY_LABELS = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  groq: 'Groq',
  claude: 'Anthropic Claude',
  openrouter: 'OpenRouter',
  perplexity: 'Perplexity',
  mistral: 'Mistral AI',
  deepseek: 'DeepSeek',
  cohere: 'Cohere'
};
// ===== المزودين التسعة: شبكة الدرج الجانبي + شريط التلفون (شعارات أصلية) =====
const PROVIDER_LOGOS = {"openai":"<svg fill=\"currentColor\" fill-rule=\"evenodd\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z\"></path></svg>","claude":"<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z\" fill=\"#D97757\" fill-rule=\"nonzero\"></path></svg>","gemini":"<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"#3186FF\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-0-_R_0_)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-1-_R_0_)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-2-_R_0_)\"></path><defs><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-0-_R_0_\" x1=\"7\" x2=\"11\" y1=\"15.5\" y2=\"12\"><stop stop-color=\"#08B962\"></stop><stop offset=\"1\" stop-color=\"#08B962\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-1-_R_0_\" x1=\"8\" x2=\"11.5\" y1=\"5.5\" y2=\"11\"><stop stop-color=\"#F94543\"></stop><stop offset=\"1\" stop-color=\"#F94543\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-2-_R_0_\" x1=\"3.5\" x2=\"17.5\" y1=\"13.5\" y2=\"12\"><stop stop-color=\"#FABC12\"></stop><stop offset=\".46\" stop-color=\"#FABC12\" stop-opacity=\"0\"></stop></linearGradient></defs></svg>","mistral":"<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z\" fill=\"gold\"></path><path d=\"M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z\" fill=\"#FFAF00\"></path><path d=\"M3.428 10.258h17.144v3.428H3.428v-3.428z\" fill=\"#FF8205\"></path><path d=\"M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z\" fill=\"#FA500F\"></path><path d=\"M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z\" fill=\"#E10500\"></path></svg>","perplexity":"<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z\" fill=\"#22B8CD\" fill-rule=\"nonzero\"></path></svg>","deepseek":"<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z\" fill=\"#4D6BFE\"></path></svg>","openrouter":"<svg fill=\"currentColor\" fill-rule=\"evenodd\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M18.654 3.87a5.087 5.087 0 110 10.174L23.7 19.09c.64.641.187 1.737-.72 1.737H8.48a8.479 8.479 0 010-16.958h10.175zM8.479 7.26a5.087 5.087 0 100 10.176 5.087 5.087 0 000-10.175z\"></path></svg>","groq":"<svg fill=\"currentColor\" fill-rule=\"evenodd\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z\"></path></svg>","cohere":"<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path clip-rule=\"evenodd\" d=\"M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z\" fill=\"#39594D\" fill-rule=\"evenodd\"></path><path clip-rule=\"evenodd\" d=\"M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z\" fill=\"#D18EE2\" fill-rule=\"evenodd\"></path><path d=\"M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z\" fill=\"#FF7759\"></path></svg>"};
// v358 — نظام الـ3 نماذج الوظيفية: 3 ظاهرة (بشعاراتها الحقيقية) + 6 خلف الكواليس.
// كل مجموعة لها سلسلة احتياط صامتة داخلية — لو تعطّل الأول يغطّيه اللي بعده بنفس الاسم الوظيفي.
// v359 — 3 مجموعات: الرأس ظاهر بشعاره الحقيقي، وبقية المجموعة احتياط صامت خلفه.
const FUNCTIONAL_GROUPS = {
  claude: ['claude'],                                                // 👑 الكينج — بناء/تعديل/تشخيص
  gemini: ['gemini', 'groq', 'mistral'],                             // ⚡ السريع — ردود فورية/دردشة
  openai: ['openai', 'deepseek', 'perplexity', 'cohere', 'openrouter'], // 🧠 العميق — تحليل/بحث/مستندات
};
function funcPrimaryOf(key){
  for(const primary in FUNCTIONAL_GROUPS){ if(FUNCTIONAL_GROUPS[primary].indexOf(key) !== -1) return primary; }
  return 'claude';
}
// v359 — الشفافية الكاملة (قرار المستخدم): كل رد يظهر بالاسم الحقيقي الشهير للمزود
// الذي ردّ فعلًا. لو انشغل الرأس وردّ احتياطي مخفي → يظهر باسمه الحقيقي، لا اسم مموّه.
const PROVIDER_DISPLAY = {
  claude: 'Claude', gemini: 'Gemini', openai: 'GPT', groq: 'Groq',
  mistral: 'Mistral', deepseek: 'DeepSeek', perplexity: 'Perplexity',
  cohere: 'Cohere', openrouter: 'OpenRouter',
};
function functionalLabel(key){
  // v362 — الستة المخفيون لا يظهر اسمهم أبدًا: أي مزود يرد → يُعرض باسم
  // رأس مجموعته الظاهر (Groq/Mistral→Gemini، DeepSeek/Perplexity/Cohere/OpenRouter→GPT، Claude→Claude).
  const primary = funcPrimaryOf(key);
  return PROVIDER_DISPLAY[primary] || PROVIDER_KEY_LABELS[primary] || primary;
}
// v359 — 3 أزرار بأسمائها الحقيقية الشهيرة (الناس تعرفها) + شعاراتها الأصلية.
const PROVIDER_QUICK_LIST = [
  { key: 'claude', name: 'Claude', color: '#d97757' },
  { key: 'gemini', name: 'Gemini', color: '#4285f4' },
  { key: 'openai', name: 'GPT',    color: '#10a37f' },
];
// ترحيل: من اختار «العميق» (deepseek) في v358 يرجع للزر الظاهر الجديد GPT.
try{ if(localStorage.getItem('aiapp_provider') === 'deepseek') localStorage.setItem('aiapp_provider', 'openai'); }catch(e){ __swallow(e, "save:app-05-ui#22"); }
let providerQuickBarBuilt = false;
function selectProviderKey(key){
  const prev = localStorage.getItem('aiapp_provider') || 'claude';
  localStorage.setItem('aiapp_provider', key);
  // v262: المستخدم اختار مزودًا بيده → نحترم اختياره ويتعطل التوجيه بالتخصص
  localStorage.setItem('aiapp_provider_explicit', '1');
  const sel = document.getElementById('provider');
  if(sel) sel.value = key;
  // 🆕 تغيير المزود = محادثة ومشروع جديد نظيف (قرار 26/7) — بدون خلط مواضيع.
  // المشروع السابق يظل محفوظًا في قائمة المشاريع.
  if(key !== prev){
    // 🆕 (27/7) كل مزود له مشروعه/محادثته الخاصة — لا دمج بين المزودين.
    // v216: عزل صارم بحقل provider على كل مشروع — يمنع مشاركة نفس المشروع بين مزودين.
    let provMap = {};
    try{ provMap = JSON.parse(localStorage.getItem('aiapp_provider_projects') || '{}'); }catch(e){ __swallow(e, "misc:app-05-ui#23"); }
    provMap[prev] = state.currentId; // احفظ محادثة المزود السابق
    const curProj = state.projects.find(p => p.id === state.currentId);
    if(curProj && !curProj.provider) curProj.provider = prev; // ثبّت ملكية المشروع الحالي للمزود السابق
    // ارجع فقط لمشروع يملكه هذا المزود فعليًا (provider === key)
    const savedId = provMap[key];
    let saved = savedId ? state.projects.find(p => p.id === savedId && p.provider === key) : null;
    if(!saved){
      const owned = state.projects.filter(p => p.provider === key);
      saved = owned.length ? owned[owned.length - 1] : null;
    }
    if(saved){
      state.currentId = saved.id; // ارجع لمحادثة هذا المزود السابقة
    } else {
      const id = 'p_' + Date.now();
      state.projects.push({id, title: t('defaultProjectTitle'), messages: [], code: '', provider: key});
      state.currentId = id;
    }
    provMap[key] = state.currentId;
    localStorage.setItem('aiapp_provider_projects', JSON.stringify(provMap));
    if(typeof mahaClearImageRef === 'function') mahaClearImageRef();
    saveState();
    renderAll();
  }
  updateProviderQuickBarActive();
  // 🆕 (26/7) الضغط على أي مزود → يرجع المستخدم للمحادثة مباشرة
  try{
    if(typeof closeDrawers === 'function') closeDrawers();
    const inp = document.getElementById('chatInput') || document.getElementById('userInput') || document.querySelector('#chat textarea, textarea');
    if(inp && window.matchMedia && !window.matchMedia('(pointer:coarse)').matches) inp.focus();
    const chatEl = document.getElementById('chat') || document.getElementById('messages');
    if(chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }catch(e){ __swallow(e, "ui:app-05-ui#24"); }
}
function buildProviderQuickBar(){
  const grid = document.getElementById('providerGridCells');
  const strip = document.getElementById('providerStripMobile');
  if(!grid && !strip) return;
  if(grid) grid.innerHTML = '';
  if(strip) strip.innerHTML = '';
  PROVIDER_QUICK_LIST.forEach(p => {
    const svg = PROVIDER_LOGOS[p.key] || '';
    if(grid){
      const cell = document.createElement('div');
      cell.className = 'prov-cell';
      cell.dataset.provider = p.key;
      cell.style.color = p.color;
      cell.innerHTML = svg + '<span class="prov-name">' + functionalLabel(p.key) + '</span><span class="prov-dot"></span>';
      cell.onclick = () => selectProviderKey(p.key);
      grid.appendChild(cell);
    }
    if(strip){
      const chip = document.createElement('div');
      chip.className = 'prov-chip-m';
      chip.dataset.provider = p.key;
      chip.style.color = p.color;
      chip.innerHTML = svg + '<span>' + functionalLabel(p.key) + '</span>';
      chip.onclick = () => selectProviderKey(p.key);
      strip.appendChild(chip);
    }
  });
  providerQuickBarBuilt = true;
  if(typeof initProvDropdown === 'function') initProvDropdown();
}
/* v336: قائمة المزودين المنسدلة (كمبيوتر فقط) */
function provDDUpdateButton(){
  try{
    const cur = localStorage.getItem('aiapp_provider') || 'claude';
    const p = PROVIDER_QUICK_LIST.find(x => x.key === cur) || PROVIDER_QUICK_LIST[0];
    const logo = document.getElementById('provDDLogo');
    const name = document.getElementById('provDDName');
    if(logo && p){ logo.innerHTML = PROVIDER_LOGOS[p.key] || ''; logo.style.color = p.color; }
    if(name && p){ name.textContent = functionalLabel(p.key); }
  }catch(e){ __swallow(e, "ui:app-05-ui#25"); }
}
let _provDDInited = false;
function initProvDropdown(){
  if(_provDDInited) return;
  const wrap = document.getElementById('providerGridSidebar');
  const btn = document.getElementById('provDropdownBtn');
  const panel = document.getElementById('provDropdownPanel');
  const search = document.getElementById('provSearchInput');
  if(!wrap || !btn || !panel) return;
  _provDDInited = true;
  function provDDFilter(q){
    q = (q || '').trim().toLowerCase();
    document.querySelectorAll('#providerGridCells .prov-cell').forEach(c => {
      const nm = ((c.querySelector('.prov-name') || {}).textContent || '').toLowerCase();
      c.style.display = (!q || nm.indexOf(q) !== -1 || (c.dataset.provider || '').indexOf(q) !== -1) ? '' : 'none';
    });
  }
  btn.onclick = (e) => {
    e.stopPropagation();
    try{ if(typeof closeHeaderMenu === 'function') closeHeaderMenu(); }catch(_){ __swallow(_, "ui:app-05-ui#26"); }
    wrap.classList.toggle('open');
    if(wrap.classList.contains('open') && search){ search.value = ''; provDDFilter(''); try{ search.focus(); }catch(_){ __swallow(_, "ui:app-05-ui#27"); } }
  };
  document.addEventListener('click', (e) => { if(!wrap.contains(e.target)) wrap.classList.remove('open'); });
  panel.addEventListener('click', (e) => { const cell = e.target.closest('.prov-cell'); if(cell) wrap.classList.remove('open'); });
  if(search){ search.addEventListener('input', () => provDDFilter(search.value)); search.onclick = (e) => e.stopPropagation(); }
  provDDUpdateButton();
}
function updateProviderQuickBarActive(){
  const current = localStorage.getItem('aiapp_provider') || 'claude';
  document.querySelectorAll('.prov-cell, .prov-chip-m').forEach(el => {
    el.classList.toggle('active', el.dataset.provider === current);
    el.title = PROVIDER_KEY_LABELS[el.dataset.provider] || el.dataset.provider;
  });
  if(typeof provDDUpdateButton === 'function') provDDUpdateButton();
  if(typeof updatePremiumToggleVisibility === 'function') updatePremiumToggleVisibility();
  try{
    const active = document.querySelector('.prov-chip-m.active');
    if(active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }catch(e){ __swallow(e, "points:app-05-ui#28"); }
}
async function refreshProviderQuickBar(){
  if(!providerQuickBarBuilt) buildProviderQuickBar();
  updateProviderQuickBarActive();
  try{
    const res = await fetch('/api/usage-status', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
    });
    const data = await res.json();
    const remaining = (data && data.remaining) || {};
    const limit = data.limit || 20;
    document.querySelectorAll('.prov-cell').forEach(cell => {
      const dot = cell.querySelector('.prov-dot');
      if(!dot) return;
      const r = remaining[cell.dataset.provider];
      dot.classList.remove('ok', 'low', 'out');
      if(r === undefined) return;
      if(r === null || limit === null){ // owner: unlimited (Infinity serializes to null)
        dot.classList.add('ok');
        const lbl = PROVIDER_KEY_LABELS[cell.dataset.provider] || cell.dataset.provider;
        cell.title = lbl + ' — بلا حدود';
        return;
      }
      if(r <= 0) dot.classList.add('out');
      else if(r <= Math.max(1, Math.round(limit * 0.25))) dot.classList.add('low');
      else dot.classList.add('ok');
      const label = functionalLabel(cell.dataset.provider);
      cell.title = label + ' — ' + r + '/' + limit;
    });
  }catch(e){ /* best-effort only, ignore network errors */ }
}

function getProviderColors(){
  try{ return Object.assign({}, PROVIDER_COLOR_DEFAULTS, JSON.parse(localStorage.getItem('aiapp_provider_colors') || '{}')); }
  catch(e){ return Object.assign({}, PROVIDER_COLOR_DEFAULTS); }
}
function getTheme(){
  try{ return Object.assign({}, THEME_DEFAULTS, JSON.parse(localStorage.getItem('aiapp_theme') || '{}')); }
  catch(e){ return Object.assign({}, THEME_DEFAULTS); }
}
function applyTheme(){
  // v418: فرض الذهبي مرة وحدة على كل الأجهزة اللي عندها لون قديم (بنفسجي) محفوظ محليًا
  try{
    if(!localStorage.getItem('aiapp_gold_forced_v418')){
      const cust = JSON.parse(localStorage.getItem('aiapp_theme') || '{}');
      const OLD_PURPLE = ['#7c5cff','#9b6bff','#a78bfa','#8b5cf6','#818cf8','#6467f2'];
      if(cust.accent && OLD_PURPLE.includes(cust.accent.toLowerCase())){
        delete cust.accent;
        localStorage.setItem('aiapp_theme', JSON.stringify(cust));
      }
      localStorage.setItem('aiapp_gold_forced_v418', '1');
    }
  }catch(e){ __swallow(e, "misc:app-05-ui#gold-force"); }
  // v441: فرض الخلفية السوداء الصافية مرة وحدة — حذف أي خلفية قديمة محفوظة محليًا
  try{
    if(!localStorage.getItem('aiapp_black_bg_forced_v441')){
      const cust = JSON.parse(localStorage.getItem('aiapp_theme') || '{}');
      if(cust.bg){ delete cust.bg; localStorage.setItem('aiapp_theme', JSON.stringify(cust)); }
      localStorage.setItem('aiapp_black_bg_forced_v441', '1');
    }
  }catch(e){ __swallow(e, "misc:app-05-ui#black-bg-force"); }
  const th = getTheme();
  const root = document.documentElement.style;
  try{ const cust = JSON.parse(localStorage.getItem('aiapp_theme') || '{}'); if(cust.accent) root.setProperty('--accent', cust.accent); }catch(e){ __swallow(e, "misc:app-05-ui#29"); }
  root.setProperty('--text', th.text);
  root.setProperty('--bg', th.bg);
  root.setProperty('--user-bubble', th.userBubble);
  root.setProperty('--assistant-bubble', th.assistantBubble);
}
// Safe hex-color helpers: we intentionally avoid <input type="color"> because its
// native OS color-picker overlay can freeze the page on some Android browsers
// (notably older Huawei/EMUI WebViews) when triggered from inside a modal <dialog>.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function isValidHex(v){ return typeof v === 'string' && HEX_COLOR_RE.test(v); }
function updateSwatchFor(input){
  if(!input) return;
  const swatch = input.id
    ? document.querySelector('.color-swatch[data-for="'+input.id+'"]')
    : (input.previousElementSibling && input.previousElementSibling.classList && input.previousElementSibling.classList.contains('color-swatch') ? input.previousElementSibling : null);
  if(swatch && isValidHex(input.value)) swatch.style.background = input.value;
}
let lastFocusedColorInput = null;
document.addEventListener('focusin', (e) => {
  if(e.target && e.target.classList && e.target.classList.contains('hex-color-input')) lastFocusedColorInput = e.target;
});
document.addEventListener('input', (e) => {
  if(e.target && e.target.classList && e.target.classList.contains('hex-color-input')) updateSwatchFor(e.target);
});
const COLOR_PRESETS = ['#d4af37','#10a37f','#4285f4','#ff0000','#d97757','#6467f2','#20808d','#ff7000','#4d6bfe','#39594d','#eef0f6','#0a0b10','#ffffff','#000000','#ff4d6d','#00c2a8'];
function buildColorPresetsRow(){
  const row = $('#colorPresetsRow');
  if(!row || row.children.length) return;
  COLOR_PRESETS.forEach(hex => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = hex;
    btn.style.cssText = 'width:26px; height:26px; border-radius:50%; border:1px solid rgba(255,255,255,0.25); background:'+hex+'; cursor:pointer; padding:0;';
    btn.onclick = () => {
      const target = lastFocusedColorInput || $('#themeAccent');
      target.value = hex;
      updateSwatchFor(target);
    };
    row.appendChild(btn);
  });
}
function buildProviderColorGrid(){
  const grid = $('#providerColorGrid');
  if(!grid) return;
  const colors = getProviderColors();
  grid.innerHTML = '';
  Object.keys(PROVIDER_COLOR_DEFAULTS).forEach(name => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; font-size:12px;';
    const span = document.createElement('span');
    span.textContent = name;
    const fieldWrap = document.createElement('div');
    fieldWrap.style.cssText = 'display:flex; gap:6px; align-items:center;';
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    const value = colors[name] || PROVIDER_COLOR_DEFAULTS[name];
    swatch.style.cssText = 'width:34px; height:34px; border-radius:8px; flex-shrink:0; border:1px solid rgba(255,255,255,0.2); background:'+value+';';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'hex-color-input';
    input.maxLength = 7;
    input.dataset.providerName = name;
    input.value = value;
    input.style.cssText = 'flex:1; font-family:monospace; height:34px; padding:2px 8px; border-radius:8px;';
    fieldWrap.appendChild(swatch);
    fieldWrap.appendChild(input);
    wrap.appendChild(span);
    wrap.appendChild(fieldWrap);
    grid.appendChild(wrap);
  });
}
function loadThemeToForm(){
  const th = getTheme();
  $('#themeAccent').value = th.accent;
  $('#themeText').value = th.text;
  $('#themeBg').value = th.bg;
  $('#themeUserBubble').value = th.userBubble;
  $('#themeAssistantBubble').value = th.assistantBubble;
  ['themeAccent','themeText','themeBg','themeUserBubble','themeAssistantBubble'].forEach(id => updateSwatchFor($('#'+id)));
  buildColorPresetsRow();
  buildProviderColorGrid();
  try { buildBg3DPicker(); } catch(e) { console.error(e); }
}
function saveThemeFromForm(){
  const th = {
    accent: isValidHex($('#themeAccent').value) ? $('#themeAccent').value : getTheme().accent,
    text: isValidHex($('#themeText').value) ? $('#themeText').value : getTheme().text,
    bg: isValidHex($('#themeBg').value) ? $('#themeBg').value : getTheme().bg,
    userBubble: isValidHex($('#themeUserBubble').value) ? $('#themeUserBubble').value : getTheme().userBubble,
    assistantBubble: isValidHex($('#themeAssistantBubble').value) ? $('#themeAssistantBubble').value : getTheme().assistantBubble
  };
  localStorage.setItem('aiapp_theme', JSON.stringify(th));
  const colors = {};
  const defaults = getProviderColors();
  document.querySelectorAll('#providerColorGrid input.hex-color-input').forEach(inp => {
    colors[inp.dataset.providerName] = isValidHex(inp.value) ? inp.value : defaults[inp.dataset.providerName];
  });
  localStorage.setItem('aiapp_provider_colors', JSON.stringify(colors));
  applyTheme();
  renderMessages();
}
applyTheme();
document.addEventListener('DOMContentLoaded', applyTheme);

// ===== 3D animated background system (Vanta.js) =====
const BG3D_EFFECTS = [
  { id: 'none',     emoji: '🚫', ar: 'بدون خلفية',        en: 'No background',   fr: 'Sans arrière-plan',      hi: 'बिना पृष्ठभूमि',        ur: 'بغیر پس منظر',        bn: "কোনো ব্যাকগ্রাউন্ড নেই", ne: "पृष्ठभूमि छैन", lib: null },
  { id: 'net',      emoji: '🕸️', ar: 'شبكة سلكية',        en: 'Wire Network',    fr: 'Réseau filaire',         hi: 'तार नेटवर्क',          ur: 'تار نیٹ ورک',        bn: "ওয়্যার নেটওয়ার্ক", ne: "तार नेटवर्क", lib: 'three' },
  { id: 'waves',    emoji: '🌊', ar: 'أمواج سائلة',        en: 'Waves',           fr: 'Vagues',                 hi: 'लहरें',                ur: 'لہریں',              bn: "তরঙ্গ", ne: "लहरहरू", lib: 'three' },
  { id: 'fog',      emoji: '🌫️', ar: 'ضباب متحرك',        en: 'Fog',             fr: 'Brouillard',             hi: 'कोहरा',                ur: 'دھند',               bn: "কুয়াশা", ne: "कुहिरो", lib: 'three' },
  { id: 'globe',    emoji: '🌐', ar: 'كرة أرضية',          en: 'Globe',           fr: 'Globe',                  hi: 'ग्लोब',                ur: 'گلوب',               bn: "গ্লোব", ne: "ग्लोब", lib: 'three' },
  { id: 'rings',    emoji: '💍', ar: 'حلقات دوارة',        en: 'Rings',           fr: 'Anneaux',                hi: 'छल्ले',                ur: 'حلقے',               bn: "রিং", ne: "घण्टी", lib: 'three' },
  { id: 'halo',     emoji: '✨', ar: 'هالة ضوئية',         en: 'Halo',            fr: 'Halo',                   hi: 'प्रभामंडल',            ur: 'ہالہ',               bn: "হ্যালো", ne: "हेलो", lib: 'three' },
  { id: 'dots',     emoji: '⚪', ar: 'نقاط نابضة',         en: 'Pulsing Dots',    fr: 'Points pulsants',        hi: 'स्पंदित बिंदु',         ur: 'دھڑکتے نقطے',        bn: "স্পন্দিত বিন্দু", ne: "पल्सिङ डट्स", lib: 'three' },
  { id: 'birds',    emoji: '🐦', ar: 'جزيئات طائرة',       en: 'Birds',           fr: 'Oiseaux',                hi: 'पक्षी',                ur: 'پرندے',              bn: "পাখি", ne: "चराहरू", lib: 'three' },
  { id: 'clouds',   emoji: '☁️', ar: 'غيوم',              en: 'Clouds',          fr: 'Nuages',                 hi: 'बादल',                 ur: 'بادل',               bn: "মেঘ", ne: "बादल", lib: 'three' },
  { id: 'clouds2',  emoji: '🌥️', ar: 'غيوم متقدمة',       en: 'Clouds 2',        fr: 'Nuages 2',               hi: 'बादल 2',               ur: 'بادل 2',             bn: "মেঘ 2", ne: "बादल २", lib: 'three' },
  { id: 'trunk',    emoji: '🌳', ar: 'أشعة جذعية',         en: 'Trunk',           fr: 'Tronc',                  hi: 'तना',                  ur: 'تنا',                bn: "কাণ্ড", ne: "ट्रंक", lib: 'p5' },
  { id: 'topology', emoji: '🔺', ar: 'طبوغرافيا نقطية',    en: 'Topology',        fr: 'Topologie',              hi: 'स्थलाकृति',            ur: 'ٹوپولوجی',           bn: "টপোলজি", ne: "टोपोलोजी", lib: 'p5' },
  { id: 'cells',    emoji: '🦠', ar: 'خلايا عضوية',        en: 'Cells',           fr: 'Cellules',               hi: 'कोशिकाएं',             ur: 'خلیات',              bn: "কোষ", ne: "कक्षहरू", lib: 'p5' },
  { id: 'ocean',      emoji: '🌊', ar: 'أمواج المحيط',        en: 'Ocean Waves',       fr: 'Vagues océaniques',      hi: 'समुद्री लहरें',         ur: 'سمندری لہریں',       bn: "মহাসাগরের ঢেউ", ne: "महासागर लहरहरू", lib: 'custom' },
  { id: 'bubbles',    emoji: '🫧', ar: 'فقاعات تحت الماء',     en: 'Underwater Bubbles',fr: 'Bulles sous-marines',    hi: 'पानी के नीचे बुलबुले', ur: 'زیر آب بلبلے',       bn: "পানির নিচের বুদবুদ", ne: "पानीमुनि बुलबुले", lib: 'custom' },
  { id: 'stars',      emoji: '🌌', ar: 'سماء ليلية نجمية',     en: 'Starry Night',      fr: 'Nuit étoilée',           hi: 'तारों भरी रात',        ur: 'تاروں بھری رات',     bn: "তারার রাত", ne: "तारायुक्त रात", lib: 'custom' },
  { id: 'snow',       emoji: '❄️', ar: 'تساقط الثلج',         en: 'Snowfall',          fr: 'Chute de neige',         hi: 'बर्फबारी',              ur: 'برف باری',           bn: "তুষারপাত", ne: "हिमपात", lib: 'custom' },
  { id: 'rain',       emoji: '🌧️', ar: 'أمطار هادئة',         en: 'Gentle Rain',       fr: 'Pluie douce',            hi: 'हल्की बारिश',           ur: 'ہلکی بارش',          bn: "মৃদু বৃষ্টি", ne: "हल्का वर्षा", lib: 'custom' },
  { id: 'fireflies',  emoji: '🌳', ar: 'يراعات الغابة',        en: 'Forest Fireflies',  fr: 'Lucioles de forêt',      hi: 'जंगल की जुगनू',         ur: 'جنگل کے جگنو',       bn: "বন ফায়ারফ্লাইস", ne: "वन फायरफ्लाइज", lib: 'custom' }
];
function bgEffLabel(eff){
  return eff[lang] || eff.en;
}
const loadedScripts = {};
function loadScriptOnce(url){
  if(loadedScripts[url]) return loadedScripts[url];
  loadedScripts[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + url));
    document.head.appendChild(s);
  });
  return loadedScripts[url];
}
async function ensureBg3DDeps(lib){
  if(lib === 'three'){
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js');
  } else if(lib === 'p5'){
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js');
  }
}
async function ensureVantaEffectScript(id){
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.' + id + '.min.js');
}
let currentVantaEffect = null;
let bg3dAutoTimer = null;
let currentCustomBg = null; // {raf, resizeHandler, canvas}
function destroyBg3D(){
  if(currentVantaEffect){
    try { currentVantaEffect.destroy(); } catch(e){ __swallow(e, "misc:app-05-ui#30"); }
    currentVantaEffect = null;
  }
  if(currentCustomBg){
    try { cancelAnimationFrame(currentCustomBg.raf); } catch(e){ __swallow(e, "misc:app-05-ui#31"); }
    if(currentCustomBg.resizeHandler) window.removeEventListener('resize', currentCustomBg.resizeHandler);
    currentCustomBg = null;
  }
  const el = document.getElementById('vantaBg');
  if(el) el.innerHTML = '';
}
function initCustomBg3D(id){
  const container = document.getElementById('vantaBg');
  if(!container) return;
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let w, h;
  function resize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  let particles = [];
  let t = 0;
  const rand = (a,b) => a + Math.random()*(b-a);

  function setupParticles(){
    particles = [];
    if(id === 'ocean'){
      // no discrete particles, wave layers computed in draw
    } else if(id === 'bubbles'){
      for(let i=0;i<60;i++) particles.push({ x: rand(0,w), y: rand(0,h), r: rand(3,16), s: rand(0.4,1.6), wob: rand(0,Math.PI*2) });
    } else if(id === 'stars'){
      for(let i=0;i<160;i++) particles.push({ x: rand(0,w), y: rand(0,h*0.85), r: rand(0.5,1.8), phase: rand(0,Math.PI*2), speed: rand(0.01,0.03) });
    } else if(id === 'snow'){
      for(let i=0;i<120;i++) particles.push({ x: rand(0,w), y: rand(0,h), r: rand(1.5,4), s: rand(0.6,2.2), drift: rand(-0.5,0.5), phase: rand(0,Math.PI*2) });
    } else if(id === 'rain'){
      for(let i=0;i<150;i++) particles.push({ x: rand(0,w), y: rand(-h,h), len: rand(10,22), s: rand(6,12) });
    } else if(id === 'fireflies'){
      for(let i=0;i<45;i++) particles.push({ x: rand(0,w), y: rand(0,h), r: rand(1.5,3), vx: rand(-0.3,0.3), vy: rand(-0.3,0.3), phase: rand(0,Math.PI*2) });
    }
  }
  setupParticles();
  const oldResize = resize;
  window.removeEventListener('resize', oldResize);
  function resizeAndReset(){ resize(); setupParticles(); }
  window.addEventListener('resize', resizeAndReset);

  function drawOcean(){
    t += 0.02;
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0, '#04101f');
    grad.addColorStop(1, '#062a44');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,w,h);
    const layers = [
      { amp: 18, freq: 0.008, speed: 1.0, color: 'rgba(30,140,190,0.55)', base: h*0.62 },
      { amp: 26, freq: 0.006, speed: 0.6, color: 'rgba(20,100,160,0.55)', base: h*0.72 },
      { amp: 34, freq: 0.004, speed: 0.35,color: 'rgba(10,60,110,0.6)',  base: h*0.84 }
    ];
    layers.forEach(L => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for(let x=0; x<=w; x+=8){
        const y = L.base + Math.sin(x*L.freq + t*L.speed) * L.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = L.color;
      ctx.fill();
    });
  }
  function drawBubbles(){
    ctx.fillStyle = '#03101c';
    ctx.fillRect(0,0,w,h);
    particles.forEach(p => {
      p.y -= p.s;
      p.wob += 0.03;
      const bx = p.x + Math.sin(p.wob)*8;
      if(p.y < -20){ p.y = h+20; p.x = rand(0,w); }
      ctx.beginPath();
      ctx.arc(bx, p.y, p.r, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(140,220,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(140,220,255,0.12)';
      ctx.fill();
    });
  }
  function drawStars(){
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0, '#01030a');
    grad.addColorStop(1, '#0a1330');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,w,h);
    particles.forEach(p => {
      p.phase += p.speed;
      const alpha = 0.3 + Math.abs(Math.sin(p.phase))*0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(2) + ')';
      ctx.fill();
    });
    if(Math.random() < 0.006){
      const sx = rand(0,w*0.6), sy = rand(0,h*0.3);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx+80, sy+40);
      ctx.stroke();
    }
  }
  function drawSnow(){
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0,0,w,h);
    particles.forEach(p => {
      p.y += p.s;
      p.phase += 0.02;
      p.x += Math.sin(p.phase)*p.drift;
      if(p.y > h+10){ p.y = -10; p.x = rand(0,w); }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    });
  }
  function drawRain(){
    ctx.fillStyle = 'rgba(8,12,20,1)';
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(160,200,255,0.35)';
    ctx.lineWidth = 1;
    particles.forEach(p => {
      p.y += p.s;
      if(p.y > h){ p.y = -20; p.x = rand(0,w); }
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x-2, p.y+p.len);
      ctx.stroke();
    });
  }
  function drawFireflies(){
    ctx.fillStyle = '#020a05';
    ctx.fillRect(0,0,w,h);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.phase += 0.05;
      if(p.x < 0 || p.x > w) p.vx *= -1;
      if(p.y < 0 || p.y > h) p.vy *= -1;
      const glow = 0.4 + Math.abs(Math.sin(p.phase))*0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(200,255,120,' + glow + ')';
      ctx.fillStyle = 'rgba(220,255,150,' + glow + ')';
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }
  const drawers = { ocean: drawOcean, bubbles: drawBubbles, stars: drawStars, snow: drawSnow, rain: drawRain, fireflies: drawFireflies };
  const draw = drawers[id] || drawOcean;
  function loop(){
    draw();
    currentCustomBg.raf = requestAnimationFrame(loop);
  }
  currentCustomBg = { raf: null, resizeHandler: resizeAndReset, canvas };
  loop();
}
function getBg3DAccentColorHex(){
  try {
    const accent = getTheme().accent || 'var(--accent)';
    return parseInt(accent.replace('#',''), 16);
  } catch(e){ return 0x7c5cff; }
}
async function applyBg3D(id, save){
  if(save !== false) localStorage.setItem('aiapp_bg3d', id);
  destroyBg3D();
  document.body.classList.toggle('vantaActive', id !== 'none');
  if(id === 'none') return;
  const eff = BG3D_EFFECTS.find(e => e.id === id);
  if(!eff) return;
  if(eff.lib === 'custom'){
    try { initCustomBg3D(id); } catch(e){ console.warn('bg3d custom init failed', e); }
    return;
  }
  try {
    await ensureBg3DDeps(eff.lib);
    await ensureVantaEffectScript(id);
    if(!window.VANTA || !window.VANTA[id.toUpperCase()]) return;
    const color = getBg3DAccentColorHex();
    currentVantaEffect = window.VANTA[id.toUpperCase()]({
      el: '#vantaBg',
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200.00,
      minWidth: 200.00,
      scale: 1.00,
      scaleMobile: 1.00,
      color: color,
      backgroundColor: 0x0a0b10
    });
  } catch(e){ console.warn('bg3d init failed', e); }
}
function buildBg3DPicker(){
  const grid = $('#bg3dGrid');
  if(!grid) return;
  const current = localStorage.getItem('aiapp_bg3d') || 'none';
  const lang = document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'ar';
  grid.innerHTML = '';
  BG3D_EFFECTS.forEach(eff => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bg3dOption' + (eff.id === current ? ' active' : '');
    btn.innerHTML = '<span class="bg3dEmoji">' + eff.emoji + '</span><span>' + bgEffLabel(eff) + '</span>';
    btn.onclick = () => {
      applyBg3D(eff.id);
      grid.querySelectorAll('.bg3dOption').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
    grid.appendChild(btn);
  });
  // 🕯️ ٦ أغسطس: التبديل التلقائي مقتول بأمر عمران — لا مفتاح يُعرض ولا مؤقّت يُخلق.
  const chkAuto = $('#chkBg3dAuto');
  if(chkAuto){
    chkAuto.checked = false;
    const row = chkAuto.closest('label') || chkAuto.parentElement;
    if(row) row.style.display = 'none';
  }
}
function setupBg3DAutoTimer(){
  // مقتول: يوقف أي مؤقّت قديم ويمحو المفتاح المخزَّن فلا تعود الخلفية تتبدّل وحدها.
  if(bg3dAutoTimer){ clearInterval(bg3dAutoTimer); bg3dAutoTimer = null; }
  try{ localStorage.removeItem('aiapp_bg3d_auto'); }catch(e){ __swallow(e, 'bg3d:autokill'); }
}
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('aiapp_bg3d') || 'none';
  applyBg3D(saved, false);
  setupBg3DAutoTimer();
});

// settings dialog
const settingsDialog = $('#settingsDialog');
// Double-click the settings dialog's title bar to instantly maximize it
// (like a real desktop window), double-click again to restore the size
// the user had before (their manual drag-resize is remembered).
(function(){
  const titleEl = document.getElementById('settingsDlgTitle');
  if (!titleEl || !settingsDialog) return;
  let maximized = false;
  let prevRect = null; // {width,height} chosen by the user via drag-resize
  titleEl.addEventListener('dblclick', (e)=>{
    e.preventDefault();
    if (!maximized){
      const r = settingsDialog.getBoundingClientRect();
      prevRect = { width: r.width + 'px', height: r.height + 'px' };
      settingsDialog.style.transition = 'width .18s ease, height .18s ease';
      settingsDialog.style.width = '96vw';
      settingsDialog.style.height = '92vh';
      maximized = true;
    } else {
      settingsDialog.style.transition = 'width .18s ease, height .18s ease';
      if (prevRect){
        settingsDialog.style.width = prevRect.width;
        settingsDialog.style.height = prevRect.height;
      } else {
        settingsDialog.style.width = '';
        settingsDialog.style.height = '';
      }
      maximized = false;
    }
  });
})();
function openDialogSafe(dlg){
  if (dlg.hasAttribute('open')) return; // already open, avoid re-throw
  if (typeof dlg.showModal === 'function') {
    try { dlg.showModal(); return; } catch(e) { /* fall through to polyfill */ }
  }
  dlg.setAttribute('open', '');
  dlg.style.display = 'block';
}
function closeDialogSafe(dlg){
  if (typeof dlg.close === 'function') {
    try { dlg.close(); } catch(e) { /* ignore */ }
  }
  dlg.removeAttribute('open');
  dlg.style.display = '';
}
const SETTINGS_SECTION_IDS = ['langSection','accountSection','statsSection','apiKeysSection','themeSection','fontSizeSection','voiceSection','pricingSection','aboutSection','adminSection'];
function renderStats(){
  const projects = state.projects || [];
  let messagesCount = 0;
  const providerCounts = {};
  projects.forEach(p => {
    (p.messages || []).forEach(m => {
      if(m.role === 'user') messagesCount++;
      if(m.providerLabel){
        const key = m.providerLabel.replace(/^🔄\s*/, '');
        providerCounts[key] = (providerCounts[key] || 0) + 1;
      }
    });
  });
  let favProvider = '—';
  let favCount = 0;
  Object.keys(providerCounts).forEach(k => {
    if(providerCounts[k] > favCount){ favCount = providerCounts[k]; favProvider = k; }
  });
  const elP = $('#statProjectsCount'); if(elP) elP.textContent = String(projects.length);
  const elM = $('#statMessagesCount'); if(elM) elM.textContent = String(messagesCount);
  const elF = $('#statFavProvider'); if(elF) elF.textContent = favProvider;
}
function renderReferral(){
  const username = authGet('aiapp_username');
  const linkEl = $('#acctReferralLink');
  if(linkEl) linkEl.value = username ? (location.origin + '/?ref=' + encodeURIComponent(username)) : '';
  const bonusEl = $('#acctReferralBonus');
  if(!bonusEl) return;
  if(!username){ bonusEl.textContent = ''; return; }
  fetch('/api/usage-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
  }).then(r => r.json()).then(d => {
    const n = d.bonusMessages || 0;
    bonusEl.textContent = t('acctReferralBonusCount').replace('{n}', String(n));
  }).catch(() => { bonusEl.textContent = ''; });
}
const acctReferralCopyBtnEl = $('#acctReferralCopyBtn');
if(acctReferralCopyBtnEl){
  acctReferralCopyBtnEl.onclick = async () => {
    const linkEl = $('#acctReferralLink');
    if(!linkEl || !linkEl.value) return;
    try {
      await navigator.clipboard.writeText(linkEl.value);
      const old = acctReferralCopyBtnEl.textContent;
      acctReferralCopyBtnEl.textContent = t('acctReferralCopied');
      setTimeout(() => { acctReferralCopyBtnEl.textContent = old; }, 1500);
    } catch(e) {
      linkEl.select();
      try { document.execCommand('copy'); } catch(e2) { /* ignore */ }
    }
  };
}
function exportProjects(){
  try{
    const payload = {
      app: 'omran-ai-builder',
      exportedAt: new Date().toISOString(),
      projects: state.projects || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `omran-ai-builder-projects-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    alert(t('exportProjectsSuccess'));
  }catch(err){
    console.error('exportProjects failed', err);
  }
}
function importProjectsFromFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      const imported = Array.isArray(data) ? data : data.projects;
      if(!Array.isArray(imported)) throw new Error('invalid format');
      const validProjects = imported.filter(p => p && typeof p === 'object' && ('code' in p || 'messages' in p));
      if(!validProjects.length) throw new Error('no valid projects');
      if(!confirm(t('importProjectsConfirm'))) return;
      const existingIds = new Set((state.projects || []).map(p => p.id));
      validProjects.forEach(p => {
        if(!p.id || existingIds.has(p.id)) p.id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        existingIds.add(p.id);
        state.projects.push(p);
      });
      saveState();
      renderHistory();
      renderStats();
      alert(t('importProjectsSuccess'));
    }catch(err){
      console.error('importProjectsFromFile failed', err);
      alert(t('importProjectsError'));
    }
  };
  reader.readAsText(file);
}
window.toggleSubRow=function(id){var c=document.getElementById(id+'Content');var a=document.getElementById(id+'Arrow');if(!c)return;var open=c.style.display!=='none';c.style.display=open?'none':'block';if(a)a.style.transform=open?'rotate(0deg)':'rotate(90deg)';};
function toggleSettingsSection(id){
  const content = document.getElementById(id + 'Content');
  const arrow = document.getElementById(id + 'Arrow');
  if (!content) return;
  const isOpen = content.style.display !== 'none';
  // close all sections first (accordion behavior: only one open at a time)
  SETTINGS_SECTION_IDS.forEach(sid => {
    const c = document.getElementById(sid + 'Content');
    const a = document.getElementById(sid + 'Arrow');
    if (c) c.style.display = 'none';
    if (a) a.style.transform = 'rotate(0deg)';
  });
  // re-open the clicked one unless it was already open (toggle off)
  if (!isOpen) {
    content.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(90deg)';
    // 💰 عند فتح قسم الباقات: جلب رصيد النقاط وعرضه
    if (id === 'pricingSection' && typeof refreshPointsWallet === 'function') refreshPointsWallet();
  }
}
function collapseAllSettingsSections(){
  SETTINGS_SECTION_IDS.forEach(sid => {
    const c = document.getElementById(sid + 'Content');
    const a = document.getElementById(sid + 'Arrow');
    if (c) c.style.display = 'none';
    if (a) a.style.transform = 'rotate(0deg)';
  });
}

// ===== v199 Settings redesign: two-level nav (ChatGPT style) =====
const SETTINGS_NAV_IDS = ['langSection','accountSection','statsSection','apiKeysSection','themeSection','fontSizeSection','voiceSection','pricingSection','aboutSection'];
const SETTINGS_NAV_ICONS = {
  langSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  accountSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  statsSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`,
  apiKeysSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="M21 2l-9.6 9.6"></path><path d="M15.5 7.5l3 3L22 7l-3-3"></path></svg>`,
  themeSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`,
  fontSizeSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 14h-5"></path><path d="M16 16v-3.5a2.5 2.5 0 0 1 5 0V16"></path><path d="M4.5 13h6"></path><path d="m3 16 4.5-9 4.5 9"></path></svg>`,
  voiceSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>`,
  pricingSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`,
  aboutSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  feedbackSection: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`
};
function stripUiEmoji(t){ try{ return (t||'').replace(/[\u{1F000}-\u{1FAFF}\u{2100}-\u{214F}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/gu,'').trim(); }catch(e){ return t; } }
function renderSettingsNavList(){
  const listEl = document.getElementById('settingsNavList');
  if(!listEl) return;
  listEl.innerHTML = '';
  SETTINGS_NAV_IDS.forEach(sid => {
    const headerH3 = document.querySelector('#' + sid + ' .settingsSectionHeader h3');
    const label = stripUiEmoji(headerH3 ? headerH3.textContent : sid);
    const row = document.createElement('div');
    row.className = 'settingsNavRow';
    row.innerHTML = '<span class="settingsNavIcon">' + (SETTINGS_NAV_ICONS[sid] || '') + '</span>' +
      '<span class="settingsNavLabel"></span>' + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="settingsNavChevron"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    row.querySelector('.settingsNavLabel').textContent = label;
    row.onclick = () => showSettingsPage(sid);
    listEl.appendChild(row);
  });
}
function showSettingsHome(){
  const home = document.getElementById('settingsHomeView');
  const pageHdr = document.getElementById('settingsPageHeader');
  const logoutBtn = document.getElementById('settingsLogoutBtn');
  if(home) home.style.display = '';
  if(pageHdr) pageHdr.style.display = 'none';
  if(logoutBtn) logoutBtn.style.display = 'none';
  document.querySelectorAll('.settingsPageSection').forEach(el => { el.classList.remove('settingsPageActive'); el.style.display = 'none'; });
  if(settingsDialog) settingsDialog.scrollTop = 0;
}
window.showSettingsHome = showSettingsHome;
function showSettingsPage(sid){
  const home = document.getElementById('settingsHomeView');
  const pageHdr = document.getElementById('settingsPageHeader');
  const pageTitleEl = document.getElementById('settingsPageTitle');
  const logoutBtn = document.getElementById('settingsLogoutBtn');
  if(home) home.style.display = 'none';
  if(logoutBtn) logoutBtn.style.display = 'none';
  document.querySelectorAll('.settingsPageSection').forEach(el => {
    if(el.id === sid){ el.style.display = 'block'; el.classList.add('settingsPageActive'); }
    else { el.classList.remove('settingsPageActive'); el.style.display = 'none'; }
  });
  const headerH3 = document.querySelector('#' + sid + ' .settingsSectionHeader h3');
  if(pageTitleEl) pageTitleEl.textContent = stripUiEmoji(headerH3 ? headerH3.textContent : '');
  if(pageHdr) pageHdr.style.display = 'flex';
  // auto-expand the section's own accordion content (kept intact, just forced open)
  const content = document.getElementById(sid + 'Content');
  const arrow = document.getElementById(sid + 'Arrow');
  if(content) content.style.display = 'block';
  if(arrow) arrow.style.transform = 'rotate(90deg)';
  if(settingsDialog) settingsDialog.scrollTop = 0;
}
window.showSettingsPage = showSettingsPage;
(function(){
  const backBtn = document.getElementById('settingsPageBackBtn');
  if(backBtn) backBtn.onclick = () => showSettingsHome();
})();

// ---- Smart command box (local parser + AI fallback) ----
function settingsToast(msg){
  try{
    let el = document.getElementById('settingsCmdToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'settingsCmdToast';
      el.style.cssText = 'position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:#1c2230; color:#fff; padding:10px 16px; border-radius:20px; font-size:13px; z-index:100000; box-shadow:0 4px 18px rgba(0,0,0,.4); transition:opacity .3s; max-width:90vw; text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }catch(e){ __swallow(e, "ui:app-05-ui#32"); }
}
const SETTINGS_CMD_LANG_MAP = [
  { code:'ar', words:['عربي','العربية','arabic'] },
  { code:'en', words:['انجليزي','إنجليزي','الانجليزية','english'] },
  { code:'fr', words:['فرنسي','الفرنسية','french','français'] },
  { code:'hi', words:['هندي','الهندية','hindi'] },
  { code:'ur', words:['اردو','urdu'] },
  { code:'bn', words:['بنغالي','البنغالية','bengali'] },
  { code:'ne', words:['نيبالي','النيبالية','nepali'] },
  { code:'id', words:['اندونيسي','إندونيسي','indonesian'] },
  { code:'fil', words:['فلبيني','التاغالوغية','filipino','tagalog'] },
  { code:'tr', words:['تركي','التركية','turkish'] },
  { code:'zh', words:['صيني','الصينية','chinese'] },
  { code:'ru', words:['روسي','الروسية','russian'] },
  { code:'es', words:['اسباني','إسباني','الاسبانية','spanish'] },
  { code:'ml', words:['مليالم','malayalam'] },
];
const SETTINGS_CMD_BG_MAP = [
  { id:'ocean', words:['بحر','بحري','محيط','امواج البحر'] },
  { id:'waves', words:['امواج','أمواج'] },
  { id:'stars', words:['فضاء','نجوم','نجمية','سماء ليلية'] },
  { id:'rain', words:['مطر','امطار','أمطار'] },
  { id:'snow', words:['ثلج','ثلوج','تساقط الثلج'] },
  { id:'clouds', words:['غيوم','سحب'] },
  { id:'fog', words:['ضباب'] },
  { id:'bubbles', words:['فقاعات'] },
  { id:'fireflies', words:['يراعات','الغابة','فراشات مضيئة'] },
  { id:'globe', words:['كرة ارضية','كرة أرضية','globe'] },
  { id:'none', words:['بدون خلفية','الغاء الخلفية','إلغاء الخلفية','no background'] },
];
// v202: تطبيع عربي لمطابقة أدق — حذف التشكيل والتطويل + توحيد أ/إ/آ→ا و ة→ه و ى→ي
function settingsCmdNormalize(s){
  return String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .replace(/\s+/g, ' ')
    .trim();
}
function parseSettingsCommand(raw){
  const text = String(raw || '').trim();
  const low = settingsCmdNormalize(text);
  const has = (words) => words.some(w => { const n = settingsCmdNormalize(w); return n && low.includes(n); });
  const actions = [];
  // 1) reset
  if(has(['رجع كل شي','ارجاع كل شي','استعاده الافتراضي','اعاده الضبط','الوضع الافتراضي','reset all','reset everything','restore defaults'])){
    actions.push({ type:'reset' });
    return actions;
  }
  // 2) language — لغة محددة، وإلا مرادفات (لغة/ترجم/بدل اللغة) → تبديل عربي/إنجليزي
  let langMatched = false;
  for(const entry of SETTINGS_CMD_LANG_MAP){
    if(has(entry.words)){
      actions.push({ type:'lang', value: entry.code });
      langMatched = true;
      break;
    }
  }
  if(!langMatched && has(['بدل اللغة','غير اللغة','تغيير اللغة','ترجم','اللغة','language','translate'])){
    const cur = (typeof lang !== 'undefined' && lang) ? lang : (localStorage.getItem('aiapp_lang') || 'ar');
    actions.push({ type:'lang', value: cur === 'ar' ? 'en' : 'ar' });
  }
  // 3) font size — مرادفات: خط/كتابة/حجم + كبر/صغر
  if(has(['كبر الخط','اكبر','كبر','زود الخط','حجم اكبر','كبر الكتابة','zoom in','bigger','increase font','larger text'])){
    actions.push({ type:'font', value:'bigger' });
  } else if(has(['صغر الخط','اصغر','صغر','قلل الخط','حجم اصغر','صغر الكتابة','zoom out','smaller','decrease font'])){
    actions.push({ type:'font', value:'smaller' });
  }
  // 4) background — مرادفات عامة (خلفية/ثيم/مظهر) + خلفيات محددة
  for(const entry of SETTINGS_CMD_BG_MAP){
    if(has(entry.words)){
      actions.push({ type:'bg', value: entry.id });
      break;
    }
  }
  // 5) voice gender — مرادفات: صوت/تحدث/استماع/نطق
  const voiceCtx = has(['صوت','تحدث','استماع','نطق','قراءة','voice','speech']);
  if((voiceCtx || true) && has(['صوت رجالي','صوت رجل','صوت ذكوري','رجالي','ذكوري','male voice'])){
    actions.push({ type:'voice', value:'male' });
  } else if(has(['صوت نسائي','صوت حريمي','صوت انثوي','نسائي','انثوي','حريمي','female voice'])){
    actions.push({ type:'voice', value:'female' });
  }
  // 6) ticker — مرادفات: اسهم/تيكر/بورصة/شريط + تشغيل/إيقاف
  const tickerCtx = has(['اسهم','الاسهم','تيكر','بورصة','البورصة','شريط','ticker','stocks']);
  if(tickerCtx){
    if(has(['وقف','ايقاف','اخف','اخفاء','اقفل','عطل','stop','disable','hide','off'])){
      actions.push({ type:'ticker', value:'off' });
    } else if(has(['شغل','تشغيل','اظهر','اظهار','فعل','ارجع','رجع','start','enable','show','on'])){
      actions.push({ type:'ticker', value:'on' });
    }
  }
  return actions.length ? actions : null;
}
// v202: عند عدم الفهم — نقترح أقرب أمر معروف بدل تجاهل الطلب
const SETTINGS_CMD_EXAMPLES = ['كبر الخط','صغر الخط','بدل اللغة','غير الخلفية إلى نجوم','خلفية مطر','خلفية بحر','خلفية ثلج','بدون خلفية','شغل شريط الأسهم','وقف شريط الأسهم','صوت رجالي','صوت نسائي','رجع كل شي افتراضي'];
function settingsCmdClosestSuggestion(text){
  const low = settingsCmdNormalize(text);
  if(!low) return null;
  const toks = low.split(' ').filter(w => w.length >= 2);
  let best = null, bestScore = 0;
  for(const ex of SETTINGS_CMD_EXAMPLES){
    const exN = settingsCmdNormalize(ex);
    let score = 0;
    toks.forEach(tk => { if(exN.includes(tk)) score += tk.length; });
    exN.split(' ').forEach(tk => { if(tk.length >= 2 && low.includes(tk)) score += 1; });
    if(score > bestScore){ bestScore = score; best = ex; }
  }
  return bestScore >= 2 ? best : null;
}
function applyUiFontScale(scale){
  scale = Math.max(0.7, Math.min(1.5, scale));
  document.documentElement.style.setProperty('--ui-font-scale', String(scale));
  document.documentElement.style.fontSize = (scale * 100) + '%';
  localStorage.setItem('uiFontScale', String(scale));
}
(function(){
  const saved = parseFloat(localStorage.getItem('uiFontScale'));
  if(saved && isFinite(saved) && saved !== 1) applyUiFontScale(saved);
})();
function settingsResetAll(){
  ['uiFontScale','aiapp_bg3d','aiapp_voice_gender','tickerEnabled','aiapp_cloud_voice','aiapp_cloud_voice_name','aiapp_theme','aiapp_provider_colors'].forEach(k => localStorage.removeItem(k));
  location.reload();
}
async function executeSettingsActions(actions){
  const doneMsgs = [];
  for(const act of actions){
    try{
      if(act.type === 'reset'){ settingsResetAll(); return; }
      if(act.type === 'lang'){ setLang(act.value); doneMsgs.push(t('settingsCmdDoneLang') || 'تم تغيير اللغة'); }
      else if(act.type === 'font'){
        const cur = parseFloat(localStorage.getItem('uiFontScale')) || 1;
        applyUiFontScale(act.value === 'bigger' ? cur * 1.1 : cur * 0.9);
        doneMsgs.push(t('settingsCmdDoneFont') || 'تم تغيير حجم الخط');
      }
      else if(act.type === 'bg'){ if(typeof applyBg3D === 'function') applyBg3D(act.value, true); doneMsgs.push(t('settingsCmdDoneBg') || 'تم تغيير الخلفية'); }
      else if(act.type === 'voice'){ localStorage.setItem('aiapp_voice_gender', act.value); try{ setVoiceGenderUI(act.value); }catch(e){ __swallow(e, "save:app-05-ui#33"); } doneMsgs.push(t('settingsCmdDoneVoice') || 'تم تغيير الصوت'); }
      else if(act.type === 'ticker'){ setTickerEnabled(act.value === 'on'); doneMsgs.push(act.value === 'on' ? (t('settingsCmdDoneTickerOn') || 'تم تشغيل شريط الأسهم') : (t('settingsCmdDoneTickerOff') || 'تم إيقاف شريط الأسهم')); }
    }catch(e){ console.error('settings command action failed', act, e); }
  }
  if(doneMsgs.length) settingsToast('✓ ' + doneMsgs.join(' • '));
}
async function settingsCmdAiFallback(text){
  try{
    const sysNote = 'أعد فقط JSON بالشكل التالي بدون أي شرح: {"actions":[{"type":"lang|font|bg|voice|ticker|reset","value":"..."}]}. اطلب من المستخدم: ' + text;
    const res = await fetch('/api/ai?action=agent', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ provider:'claude', messages:[{ role:'user', content: sysNote }], token: authGet('aiapp_auth_token'), guestId: window.getGuestId ? window.getGuestId() : undefined })
    });
    const data = await res.json();
    const raw = (data && (data.text || data.content || data.reply)) || '';
    const match = String(raw).match(/\{[\s\S]*\}/);
    if(!match) return false;
    const parsed = JSON.parse(match[0]);
    if(!parsed || !Array.isArray(parsed.actions) || !parsed.actions.length) return false;
    await executeSettingsActions(parsed.actions);
    return true;
  }catch(e){ console.warn('settingsCmdAiFallback failed', e); return false; }
}
async function runSettingsCommand(){
  const inp = document.getElementById('settingsCmdInput');
  if(!inp) return;
  const text = inp.value.trim();
  if(!text) return;
  const localActions = parseSettingsCommand(text);
  if(localActions){
    await executeSettingsActions(localActions);
    inp.value = '';
    return;
  }
  const ok = await settingsCmdAiFallback(text);
  if(ok){ inp.value = ''; }
  else {
    const sug = settingsCmdClosestSuggestion(text);
    if(sug){ settingsToast((t('settingsCmdNotUnderstood') || 'ما فهمت الطلب') + ' — هل تقصد: «' + sug + '»؟'); }
    else { settingsToast(t('settingsCmdNotUnderstood') || 'ما فهمت الطلب، جرب صياغة ثانية'); }
  }
}
(function(){
  const sendBtn = document.getElementById('settingsCmdSendBtn');
  const inp = document.getElementById('settingsCmdInput');
  if(sendBtn) sendBtn.onclick = runSettingsCommand;
  if(inp) inp.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); runSettingsCommand(); } });
})();

// ---- Mic button for the smart command box (reuses /api/stt) ----
let settingsCmdRecorder = null, settingsCmdChunks = [], settingsCmdStream = null;
async function settingsCmdMicToggle(){
  const btn = document.getElementById('settingsCmdMicBtn');
  if(settingsCmdRecorder && settingsCmdRecorder.state === 'recording'){ settingsCmdRecorder.stop(); return; }
  try{ settingsCmdStream = await navigator.mediaDevices.getUserMedia({ audio:true }); }
  catch(e){ settingsToast(t('micNotSupported') || 'الميكروفون غير متاح'); return; }
  settingsCmdChunks = [];
  const mimeType = (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm')) ? 'audio/webm' : '';
  settingsCmdRecorder = mimeType ? new MediaRecorder(settingsCmdStream, { mimeType }) : new MediaRecorder(settingsCmdStream);
  settingsCmdRecorder.ondataavailable = (e) => { if(e.data && e.data.size) settingsCmdChunks.push(e.data); };
  settingsCmdRecorder.onstop = async () => {
    if(btn){ btn.classList.remove('recording'); btn.style.color = 'var(--accent)'; }
    if(settingsCmdStream) settingsCmdStream.getTracks().forEach(tr => tr.stop());
    try{
      const blob = new Blob(settingsCmdChunks, { type: (settingsCmdRecorder && settingsCmdRecorder.mimeType) || 'audio/webm' });
      if(blob.size < 500) return;
      const audioBase64 = await blobToBase64(blob);
      const res = await fetch('/api/stt', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ audioBase64, mimeType: blob.type, lang, token: authGet('aiapp_auth_token'), guestId: window.getGuestId ? window.getGuestId() : undefined })
      });
      const data = await res.json();
      if(res.ok && data && data.text){
        const inp = document.getElementById('settingsCmdInput');
        if(inp){ inp.value = (inp.value ? inp.value + ' ' : '') + data.text.trim(); inp.focus(); }
      }
    }catch(e){ console.error('settingsCmdMicToggle transcribe failed', e); }
  };
  settingsCmdRecorder.start();
  if(btn){ btn.classList.add('recording'); btn.style.color = '#ff4d4d'; }
}
(function(){
  const micBtn = document.getElementById('settingsCmdMicBtn');
  if(micBtn) micBtn.onclick = settingsCmdMicToggle;
})();

// ---- Feature ④: calm stock ticker toggle ----
function setTickerEnabled(on){
  localStorage.setItem('tickerEnabled', on ? '1' : '0');
  if(on){
    // إعادة التشغيل من الإعدادات تفتح الشريط المطوي أيضًا
    try{ localStorage.removeItem('tickerHidden'); localStorage.removeItem('tickerCollapsed'); }catch(e){ __swallow(e, "save:app-05-ui#34"); }
    if(typeof window.__tickerStart === 'function') window.__tickerStart();
  } else {
    if(typeof window.__tickerStop === 'function') window.__tickerStop();
  }
  const sw = document.getElementById('tickerToggleSwitch');
  if(sw) sw.checked = !!on;
}
window.setTickerEnabled = setTickerEnabled;

/* ───────── تأكيد قبل صرف النقاط ─────────
   الخادم يرجع 428 مع السعر بدل التنفيذ الصامت. هنا نعرضه ونعيد الطلب
   بـ confirmed:true فقط بعد موافقة صريحة. */
async function postWithConfirm(url, payload){
  const send = (body) => fetch(url, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body),
    signal: (typeof genAbortController !== 'undefined' && genAbortController) ? genAbortController.signal : undefined,
  });
  let res = await send(payload);
  if(res.status !== 428) return res;

  let q = {};
  try { q = await res.json(); } catch(e){ console.warn('[confirm] bad quote', e); }
  const isEn = (typeof AL === 'function' && AL() === 'en');
  const msg = q.message_ar || ((isEn ? 'This will cost ' : 'هذه العملية تخصم ')
    + (q.cost || '?') + (isEn ? ' points' : ' نقطة') + (q.label ? ' (' + q.label + ')' : '') + '.');
  const okToSpend = confirm(msg + '\n' + (isEn ? 'Continue?' : 'أكمل؟'));
  if(!okToSpend) return res;
  return await send(Object.assign({}, payload, { confirmed: true }));
}
window.postWithConfirm = postWithConfirm;
