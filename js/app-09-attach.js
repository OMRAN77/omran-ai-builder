/* Global shim so the dozen per-feature status writes scattered through the
   send flow can feed the same bar instead of wiping it with textContent=.
   Falls back to the old behaviour when no bar exists. */
function chatPhase(icon, text, el){
  const st = window.__chatStatus;
  if(st && !st.isReleased()){ st.phase(icon, text); return; }
  if(el) el.textContent = (icon ? icon + ' ' : '') + text;
}

/* ───────── شريط الحالة: ماذا يفعل الذكاء الاصطناعي الآن ─────────
   Steps ACCUMULATE instead of overwriting each other. The old code did
   a plain textContent assignment, so the user only ever saw the last
   step and never learned that three searches ran, or that one of them failed.
   A silent wait reads as a frozen app; an explained wait reads as work.
   Rule: only report what actually happened. Never invent "thinking deeply…"
   while waiting on a socket. */
function makeChatStatus(el){
  const steps = [];
  let finished = false;
  function render(){
    if(!el || finished || !steps.length) return;
    /* v-status-tidy (طلب المالك «رتب أول خروج المحادثة»): الجوال كان يعرض كل
       الخطوات سطورًا متراكمة — الآن سطر واحد للخطوة الحالية وسجلّ مطويّ كالحاسوب. */
    const oldDetails = el.querySelector && el.querySelector('.chat-status-fold');
    const wasOpen = !!(oldDetails && oldDetails.open);
    el.innerHTML = '';
    const current = steps[steps.length - 1];
    const details = document.createElement('details');
    details.className = 'chat-status-fold';
    details.open = wasOpen;
    const summary = document.createElement('summary');
    const currentIcon = document.createElement('span');
    currentIcon.className = 'chat-status-icon';
    /* v-status-ai (طلب المالك «شكل جميل يخص الذكاء الاصطناعي»): شرارة نابضة،
       ونص بلمعان ذهبي يمرّ عليه، ونقاط «كتابة» صغيرة ما دامت الخطوة جارية. */
    currentIcon.textContent = current.state === 'fail' ? '✗' : (current.state === 'done' ? '✓' : '✦');
    if(current.state === 'run'){ currentIcon.classList.add('chat-status-spark'); summary.classList.add('is-running'); } /* v-status-glow */
    const currentText = document.createElement('span');
    currentText.textContent = current.text;
    currentText.className = 'chat-status-text' + (current.state === 'run' ? ' chat-status-running' : '');
    summary.appendChild(currentIcon); summary.appendChild(currentText);
    if(current.state === 'run'){
      const dots = document.createElement('span');
      dots.className = 'chat-status-dots';
      dots.innerHTML = '<i></i><i></i><i></i>';
      summary.appendChild(dots);
    }
    details.appendChild(summary);
    if(steps.length > 1){
      const history = document.createElement('div');
      history.className = 'chat-status-history';
      steps.slice(0, -1).forEach(function(s){
        const row = document.createElement('div');
        row.className = 'chat-status-row ' + s.state;
        const icon = document.createElement('span');
        icon.textContent = s.state === 'fail' ? '✗' : (s.state === 'done' ? '✓' : s.icon || '•');
        const txt = document.createElement('span');
        txt.textContent = s.text;
        row.appendChild(icon); row.appendChild(txt); history.appendChild(row);
      });
      details.appendChild(history);
    }
    el.appendChild(details);
  }
  return {
    /* Adds a step and returns a handle to close it later. */
    step: function(icon, text){
      const s = { icon: icon, text: text, state: 'run' };
      steps.push(s); render();
      return {
        done: function(note){ s.state = 'done'; if(note) s.text = text + ' — ' + note; render(); },
        fail: function(note){ s.state = 'fail'; if(note) s.text = text + ' — ' + note; render(); },
      };
    },
    /* A named phase. Calling it again with the same icon UPDATES the current
       line instead of adding a new one — video/image polling ticks every few
       seconds and would otherwise flood the bar with identical rows. */
    phase: function(icon, text){
      const last = steps[steps.length - 1];
      if(last && last.state === 'run' && last.icon === icon){ last.text = text; render(); return; }
      if(last && last.state === 'run') last.state = 'done';
      steps.push({ icon: icon, text: text, state: 'run' });
      render();
    },
    /* One-off note that needs no completion state. */
    note: function(icon, text){ steps.push({ icon: icon, text: text, state: 'note' }); render(); },
    /* Streaming text has started — the bar hands over to the reply itself. */
    release: function(){
      const last = steps[steps.length - 1];
      if(last && last.state === 'run') last.state = 'done';
      render();
      finished = true;
    },
    isReleased: function(){ return finished; },
    isEmpty: function(){ return steps.length === 0; },
  };
}

/* وضع النظام: balanced (افتراضي) / guided / factory (اختبار فقط).
   localStorage 'aiapp_mode' → يُرسل مع كل طلب AI.
   balanced = هوية مختصرة + تاريخ + دولة.
   guided = الشخصية الكاملة القديمة.
   factory = بدون أي إضافات (للاختبار فقط). */
function AI_MODE_NAME(){
  try {
    const m = (localStorage.getItem('aiapp_mode') || 'balanced').trim().toLowerCase();
    /* minimal مرادف قديم لـ balanced. */
    if (m === 'minimal') return 'balanced';
    return ['factory','balanced','guided'].indexOf(m) !== -1 ? m : 'balanced';
  } catch(e){ return 'balanced'; }
}
/* v401 — balanced هو الافتراضي. Factory متاح للاختبار فقط. */
function AI_FACTORY_MODE(){ return AI_MODE_NAME() === 'factory'; }
// ---- Attachments (images + text/code files) ----
let pendingAttachments = [];
const MAX_TEXT_ATTACH_CHARS = 100000;
const MAX_ATTACH_FILE_BYTES = 25 * 1024 * 1024; // 25MB hard cap per file
const ARCHIVE_EXT_RE = /\.(zip|docx|xlsx|pptx|jar)$/i;
const IMAGE_TYPES = /^image\//;
// v-huawei: بعض مدراء الملفات (هواوي/أندرويد) وصور HEIC يعطون file.type فارغًا
// أو "application/octet-stream"، فيفشل فحص image/ ويعامَل الصورة كملف نصي —
// لذلك نتحقق أيضًا من امتداد الاسم كخيار احتياطي.
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|tiff?|svg)$/i;
function isImageAttachment(file){
  try{
    if(file && IMAGE_TYPES.test(file.type || '')) return true;
    if(file && file.name && IMAGE_EXT_RE.test(file.name)) return true;
  }catch(_e){ __swallow(_e, "attach:isImage"); }
  return false;
}

function renderAttachStrip(){
  const strip = $('#attachStrip');
  strip.innerHTML = '';
  try{ window.__updateSendReady && window.__updateSendReady(); }catch(e){ __swallow(e, "upload:app-09-attach#1"); }
  pendingAttachments.forEach((a, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attach-chip';
    if(a.isImage){
      // v587 — داخل صندوق الكتابة: مصغّرة وحدها بلا اسم
      chip.classList.add('img');
      chip.title = a.name;
      const img = document.createElement('img');
      img.src = a.dataUrl;
      img.alt = a.name;
      chip.appendChild(img);
      if(a.pending || a.error){
        const bdg = document.createElement('span');
        bdg.className = 'badge';
        bdg.textContent = a.pending ? '⏳' : '⚠️';
        chip.appendChild(bdg);
      }
    } else {
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = a.name + (a.pending ? ' ⏳' : (a.error ? ' ⚠️' : ''));
      chip.appendChild(name);
    }
    const rm = document.createElement('span');
    rm.className = 'rm';
    rm.textContent = '✕';
    rm.onclick = () => { pendingAttachments.splice(idx, 1); renderAttachStrip(); };
    chip.appendChild(rm);
    strip.appendChild(chip);
  });
  try{ window.__composerSyncTall && window.__composerSyncTall(); }catch(e){ /* guard-ok — cosmetic */ }
}

// 🖼️ v579 — أزرار فوق الصورة نفسها: «تعديل» يرجّع الصورة إلى صندوق الكتابة
// كمرفق (فيمشي مسار تعديل نفس الصورة بلا لبس)، و«حفظ» يشارك الملف أو ينزّله.
window.__omranImgTools = function(wrap, dataUrl){
  if(!wrap || !dataUrl || String(dataUrl).slice(0, 5) !== 'data:' || wrap.__imgTools) return;
  const ar = (typeof lang !== 'undefined' && lang === 'ar');
  if(!document.getElementById('oImgToolsCss')){
    const st = document.createElement('style'); st.id = 'oImgToolsCss';
    st.textContent = '.oImgBox{position:relative;display:block;width:-moz-fit-content;width:fit-content;min-width:0;max-width:min(460px,100%)}'
      + '.oImgBox>img{display:block;width:auto;max-width:100%;height:auto;max-height:62vh;object-fit:contain}'
      + '.oImgBar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:9px;pointer-events:auto}'
      // 🖼️ v641 — أمر عمران «حط كلمت التعديل داخل الصوره»: الصفّ يسكن داخل
      //    إطار الصورة (زاوية البداية السفلى) بدل ما يكون تحتها.
      + '.oImgBar.inImg{position:absolute;bottom:10px;inset-inline-start:10px;margin:0;z-index:3;max-width:calc(100% - 20px)}'
      + '.oImgBar.inImg .oImgBtn{box-shadow:0 2px 10px rgba(0,0,0,.28)}'
      + '.oImgBtn{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;height:40px;border:0;border-radius:999px;font-family:inherit;font-size:15px;font-weight:600;line-height:1;color:#fff;background:rgba(0,0,0,.38);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);cursor:pointer;transition:background .16s ease,transform .12s ease}'
      + '.oImgBtn.txt{padding:0 20px}'
      + '.oImgBtn.ico{width:40px;padding:0}'
      + '.oImgBtn:hover{background:rgba(0,0,0,.55)}'
      + '.oImgBtn:active{transform:scale(.94)}'
      + '.oImgBtn svg{width:21px;height:21px;flex:none}'
      + '.msg.assistant.oImgMsg{background:transparent !important;border:0 !important;border-radius:0 !important;padding:0 !important;width:-moz-fit-content;width:fit-content;max-width:min(486px,100%);box-sizing:border-box;overflow:hidden}'
      + 'html[data-mode="light"] .msg.assistant.oImgMsg{background:transparent !important;border:0 !important}'
      + '.msg.assistant.oImgMsg .msg-text:empty{display:none}'
      + '.msg.assistant.oImgMsg .msg-text{margin:0 0 9px;padding:0;min-width:0;overflow-wrap:break-word}'
      + '.msg.assistant.oImgMsg .msg-attachments{margin:0;min-width:0;max-width:100%}'
      + '.msg.assistant.oImgMsg .oImgBox{max-width:100%}'
      + '.msg.assistant.oImgMsg .oImgBox>img{max-width:100%;border-radius:12px}'
      + '.oImgGrp{display:flex;align-items:center;gap:10px}'
      + '.oSendOut svg{width:17px;height:17px}'
      + '.oSendBar{display:flex;align-items:center;gap:12px;margin-top:8px}'
      + '@media (max-width:640px){'
      +   '.oImgBox>img{max-height:70vh}'
      + '}';
    document.head.appendChild(st);
  }
  const ICON = {
    share: '<circle cx="18" cy="5.2" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.8" r="2.6"/><path d="M8.35 10.8l7.3-4.3"/><path d="M8.35 13.2l7.3 4.3"/>',
    done: '<path d="M4.9 12.7l4.5 4.5L19.1 7.5"/>'
  };
  const svg = (k) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>';
  const bar = document.createElement('div'); bar.className = 'oImgBar';
  const mk = (cls, html, label, fn, host) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'oImgBtn ' + cls;
    b.innerHTML = html;
    b.setAttribute('aria-label', label); b.title = label;
    b.onclick = (ev) => { ev.stopPropagation(); fn(b); };
    (host || bar).appendChild(b);
    return b;
  };
  const flash = (b, html) => {
    const prev = b.innerHTML;
    b.innerHTML = html;
    setTimeout(() => { b.innerHTML = prev; }, 1400);
  };
  // 🔗 v625 — أمر عمران: «زرّ التنزيل احذفه نهائيًّا · زرّ المشاركة لا يعمل».
  //    مقيس على جهاز عمران: مشاركة الملفّات ونسخ الصور مسدودان في متصفّحه ⇒
  //    الزرّ كان ينتهي بتنبيه بلا فعل. الآن أربع مراحل بلا صمت:
  //    ١ ورقة النظام — بلا شرط canShare (ترجع false خطأً في متصفّحات غير Chrome)
  //    ٢ الحافظة · ٣ فتح الصورة في صفحة مستقلّة (blob) حيث الضغط المطوّل يعطي
  //    «مشاركة» أصليّة · ٤ تنبيه أخير. زرّ التنزيل مُزال نهائيًّا (أمر عمران).
  // ⚠️ v592 — connect-src لا يسمح بـ data: ⇒ التحويل محلّيّ بـ atob (صفر شبكة).
  const grp = document.createElement('div'); grp.className = 'oImgGrp'; bar.appendChild(grp);
  const nmOf = () => 'image-' + Date.now() + '.png';
  const toBlob = (du) => { const s = String(du), i = s.indexOf(','), m = (s.slice(0, i).match(/:([^;,]+)/) || [])[1] || 'image/png', bin = atob(s.slice(i + 1)), u8 = new Uint8Array(bin.length); for(let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k); return new Blob([u8], { type: m }); };
  const note = (m) => { try{ if(typeof settingsToast === 'function'){ settingsToast(m); return true; } }catch(e){ __swallow(e, 'note:app-09-attach#v625'); } return false; };
  // 💾 v626 — أمر عمران: «الحفظ بضغطة واحدة — إرسال لمواقع التواصل أو أيّ إرسال».
  //    مسار حفظ صامت داخل زرّ المشاركة نفسه (لا زرّ ثالث ظاهر): إن رفض المتصفّح
  //    ورقة النظام، تُحفظ الصورة فورًا في «التنزيلات» بالنقرة نفسها ⇒ تُرسَل من
  //    هناك لأيّ تطبيق. الضغط المطوّل لم يبقَ إلّا ملاذًا أخيرًا.
  const saveDl = (bl) => {
    try{
      if(!bl) return false;
      const a = document.createElement('a');
      if(!('download' in a)) return false;
      const u = URL.createObjectURL(bl);
      a.href = u; a.download = nmOf(); a.rel = 'noopener';
      a.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try{ a.remove(); URL.revokeObjectURL(u); }catch(e){ /* guard-ok — cleanup revoke */ } }, 60000);
      return true;
    }catch(e){ __swallow(e, 'saveDl:app-09-attach#v626'); }
    return false;
  };
  const openFull = (bl) => {
    try{
      if(!bl) return false;
      const u = URL.createObjectURL(bl);
      const w = window.open(u, '_blank');
      if(w){
        setTimeout(() => { try{ URL.revokeObjectURL(u); }catch(e){ /* guard-ok — cleanup revoke */ } }, 60000);
        note(ar ? 'فتحت الصورة في صفحة مستقلّة — اضغط عليها مطوّلًا ثمّ «مشاركة»' : 'Image opened in a new tab — long-press it, then Share');
        return true;
      }
      try{ URL.revokeObjectURL(u); }catch(e){ /* guard-ok — cleanup, intentional */ }
    }catch(e){ __swallow(e, 'openFull:app-09-attach#v625'); }
    return false;
  };
  const hint = (bl) => { if(openFull(bl)) return; note(ar ? 'اضغط مطوّلًا على الصورة ثمّ «مشاركة»' : 'Long-press the image, then Share'); };
  const copyImg = (b, bl) => {
    try{
      if(bl && navigator.clipboard && window.ClipboardItem && navigator.clipboard.write){
        navigator.clipboard.write([new ClipboardItem({ [bl.type || 'image/png']: bl })])
          .then(() => { flash(b, svg('done')); note(ar ? 'نُسخت الصورة — الصقها في أيّ محادثة' : 'Image copied — paste it anywhere'); })
          .catch((e) => { __swallow(e, 'copy:app-09-attach#v625'); hint(bl); });
        return;
      }
    }catch(e){ __swallow(e, 'copy:app-09-attach#v625'); }
    hint(bl);
  };
  const saveThen = (b, bl) => {
    if(saveDl(bl)){
      flash(b, svg('done'));
      note(ar ? 'حُفظت الصورة في «التنزيلات» — أرسلها من هناك لأيّ تطبيق' : 'Saved to Downloads — send it from there to any app');
      return;
    }
    copyImg(b, bl);
  };
  // 📨 v627 — أمر عمران «نفّذ»: ورقة إرسال من صنعنا (كالتي في فيديو عمران) بدل
  //    التعويل على ورقة المتصفّح — مشاركة الملفّات ناقصة في متصفّحه فالورقة لا تظهر.
  //    المفتاح: الصورة ترتفع لرابط عامّ (Upstash؛ Vercel Blob موقوف = لا مزوّد ثانٍ)
  //    فتصبح قابلة للإرسال كرابط — وهذا مدعوم في كلّ متصفّح. الرفع يبدأ لحظة فتح
  //    الورقة لا لحظة النقر، لأنّ await قبل window.open/navigator.share يُبطل الإيماء.
  const APPS = [
    { n: ar ? 'واتساب' : 'WhatsApp', g: 'wa', c: '#25D366', u: (l) => 'https://wa.me/?text=' + encodeURIComponent(l) },
    { n: ar ? 'تيليجرام' : 'Telegram', g: 'tg', c: '#229ED9', u: (l) => 'https://t.me/share/url?url=' + encodeURIComponent(l) },
    { n: ar ? 'انستغرام' : 'Instagram', g: 'ig', c: 'radial-gradient(circle at 30% 110%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)', copy: ar ? 'نُسخ الرابط — الصقه في انستغرام' : 'Link copied — paste it in Instagram' },
    { n: ar ? 'سناب شات' : 'Snapchat', g: 'sn', c: '#FFFC00', fg: '#16161a', copy: ar ? 'نُسخ الرابط — الصقه في سناب شات' : 'Link copied — paste it in Snapchat' },
    { n: ar ? 'فيسبوك' : 'Facebook', g: 'fb', c: '#1877F2', u: (l) => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(l) },
    { n: 'X', g: 'x', c: '#111114', u: (l) => 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(l) },
    { n: ar ? 'الرسائل' : 'Messages', g: 'sms', c: '#34C759', u: (l) => 'sms:?body=' + encodeURIComponent(l) },
    { n: ar ? 'البريد' : 'Email', g: 'ml', c: '#EA4335', u: (l) => 'mailto:?subject=' + encodeURIComponent(ar ? 'صورة' : 'Image') + '&body=' + encodeURIComponent(l) }
  ];
  const GL = {
    wa: '<path d="M21 11.6a8.6 8.6 0 0 1-12.8 7.5L3.6 20.4l1.4-4.5A8.6 8.6 0 1 1 21 11.6z"/><path d="M9.2 9.1c.5 1.9 2.1 3.6 4.1 4.2"/>',
    tg: '<path d="M21.4 4.7 2.9 11.5l5.3 1.8 1.8 5.4 3-3.9 4.2 3.1z"/><path d="m8.2 13.3 12.2-8.2"/>',
    ig: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5"/><circle cx="12" cy="12" r="3.9"/><circle cx="17" cy="7" r=".9"/>',
    sn: '<path d="M12 3.6c2.5 0 4 1.8 4 4.2v3l2.3 1.1-1.7 1.4c.6 1.7 2 2.9 3.6 3.3-2 1-2.2 1.6-2.4 2.3-1.1-.3-2.3-.2-3.3.4-.8.5-1.6.8-2.5.8s-1.7-.3-2.5-.8c-1-.6-2.2-.7-3.3-.4-.2-.7-.4-1.3-2.4-2.3 1.6-.4 3-1.6 3.6-3.3l-1.7-1.4L8 10.8v-3c0-2.4 1.5-4.2 4-4.2z"/>',
    fb: '<circle cx="12" cy="12" r="8.6"/><path d="M14.6 8.4h-1.4a1.9 1.9 0 0 0-1.9 1.9v10.2"/><path d="M9.4 13.4h4.9"/>',
    x: '<path d="M5.2 5.2 18.8 18.8"/><path d="M18.8 5.2 5.2 18.8"/>',
    sms: '<rect x="3.4" y="5" width="17.2" height="11.2" rx="3"/><path d="M8.2 16.2v3.4l4.1-3.4"/>',
    ml: '<rect x="3" y="5.4" width="18" height="13.2" rx="2.6"/><path d="m3.7 7 8.3 5.9L20.3 7"/>',
    dl: '<path d="M12 4v11"/><path d="m7.6 10.9 4.4 4.4 4.4-4.4"/><path d="M4.6 19.4h14.8"/>',
    lnk: '<path d="M9.4 14.6a3.6 3.6 0 0 1 0-5.1l2.6-2.6a3.6 3.6 0 0 1 5.1 5.1l-1.3 1.3"/><path d="M14.6 9.4a3.6 3.6 0 0 1 0 5.1L12 17.1a3.6 3.6 0 0 1-5.1-5.1l1.3-1.3"/>',
    img: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.6"/><path d="m5.4 16.6 4.2-4.2 3.1 3.1 2.6-2.6 3.3 3.3"/><circle cx="9" cy="9.2" r="1.2"/>'
  };
  // v645 — شعارات رسمية (Simple Icons, fill) بدل الرسوم اليدوية
  const BR = {"wa": "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z", "tg": "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z", "ig": "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077", "sn": "M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z", "fb": "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z", "x": "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z", "sms": "M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zM4.911 7.089h11.456a2.197 2.197 0 0 1 2.165 2.19v5.863a2.213 2.213 0 0 1-2.177 2.178H8.04c-1.174 0-2.04-.99-2.04-2.178v-4.639L4.503 7.905c-.31-.42-.05-.816.408-.816zm3.415 2.19c-.347 0-.68.21-.68.544 0 .334.333.544.68.544h7.905c.346 0 .68-.21.68-.544 0-.334-.334-.545-.68-.545zm0 2.177c-.347 0-.68.21-.68.544 0 .334.333.544.68.544h7.905c.346 0 .68-.21.68-.544 0-.334-.334-.544-.68-.544zm-.013 2.19c-.346 0-.68.21-.68.544 0 .334.334.544.68.544h5.728c.347 0 .68-.21.68-.544 0-.334-.333-.545-.68-.545z", "ml": "M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"};
  // v650 — أيقونات التطبيقات الرسمية كاملة الألوان (ويكيميديا) مطابقة لأيقونات الهاتف
  const BRIMG = {"wa": "<svg preserveAspectRatio=\"xMidYMid meet\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 175.216 175.552\"><defs><linearGradient id=\"b\" x1=\"85.915\" x2=\"86.535\" y1=\"32.567\" y2=\"137.092\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#57d163\"/><stop offset=\"1\" stop-color=\"#23b33a\"/></linearGradient><filter id=\"a\" width=\"1.115\" height=\"1.114\" x=\"-.057\" y=\"-.057\" color-interpolation-filters=\"sRGB\"><feGaussianBlur stdDeviation=\"3.531\"/></filter></defs><path fill=\"#b3b3b3\" d=\"m54.532 138.45 2.235 1.324c9.387 5.571 20.15 8.518 31.126 8.523h.023c33.707 0 61.139-27.426 61.153-61.135.006-16.335-6.349-31.696-17.895-43.251A60.75 60.75 0 0 0 87.94 25.983c-33.733 0-61.166 27.423-61.178 61.13a60.98 60.98 0 0 0 9.349 32.535l1.455 2.312-6.179 22.558zm-40.811 23.544L24.16 123.88c-6.438-11.154-9.825-23.808-9.821-36.772.017-40.556 33.021-73.55 73.578-73.55 19.681.01 38.154 7.669 52.047 21.572s21.537 32.383 21.53 52.037c-.018 40.553-33.027 73.553-73.578 73.553h-.032c-12.313-.005-24.412-3.094-35.159-8.954zm0 0\" filter=\"url(#a)\"/><path fill=\"#fff\" d=\"m12.966 161.238 10.439-38.114a73.42 73.42 0 0 1-9.821-36.772c.017-40.556 33.021-73.55 73.578-73.55 19.681.01 38.154 7.669 52.047 21.572s21.537 32.383 21.53 52.037c-.018 40.553-33.027 73.553-73.578 73.553h-.032c-12.313-.005-24.412-3.094-35.159-8.954z\"/><path fill=\"url(#linearGradient1780)\" d=\"M87.184 25.227c-33.733 0-61.166 27.423-61.178 61.13a60.98 60.98 0 0 0 9.349 32.535l1.455 2.312-6.179 22.559 23.146-6.069 2.235 1.324c9.387 5.571 20.15 8.518 31.126 8.524h.023c33.707 0 61.14-27.426 61.153-61.135a60.75 60.75 0 0 0-17.895-43.251 60.75 60.75 0 0 0-43.235-17.929z\"/><path fill=\"url(#b)\" d=\"M87.184 25.227c-33.733 0-61.166 27.423-61.178 61.13a60.98 60.98 0 0 0 9.349 32.535l1.455 2.313-6.179 22.558 23.146-6.069 2.235 1.324c9.387 5.571 20.15 8.517 31.126 8.523h.023c33.707 0 61.14-27.426 61.153-61.135a60.75 60.75 0 0 0-17.895-43.251 60.75 60.75 0 0 0-43.235-17.928z\"/><path fill=\"#fff\" fill-rule=\"evenodd\" d=\"M68.772 55.603c-1.378-3.061-2.828-3.123-4.137-3.176l-3.524-.043c-1.226 0-3.218.46-4.902 2.3s-6.435 6.287-6.435 15.332 6.588 17.785 7.506 19.013 12.718 20.381 31.405 27.75c15.529 6.124 18.689 4.906 22.061 4.6s10.877-4.447 12.408-8.74 1.532-7.971 1.073-8.74-1.685-1.226-3.525-2.146-10.877-5.367-12.562-5.981-2.91-.919-4.137.921-4.746 5.979-5.819 7.206-2.144 1.381-3.984.462-7.76-2.861-14.784-9.124c-5.465-4.873-9.154-10.891-10.228-12.73s-.114-2.835.808-3.751c.825-.824 1.838-2.147 2.759-3.22s1.224-1.84 1.836-3.065.307-2.301-.153-3.22-4.032-10.011-5.666-13.647\"/></svg>", "tg": "<svg preserveAspectRatio=\"xMidYMid meet\" id=\"Livello_1\" data-name=\"Livello 1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox=\"0 0 240 240\"><defs><linearGradient id=\"linear-gradient\" x1=\"120\" y1=\"240\" x2=\"120\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#1d93d2\"/><stop offset=\"1\" stop-color=\"#38b0e3\"/></linearGradient></defs><title>Telegram_logo</title><circle cx=\"120\" cy=\"120\" r=\"120\" fill=\"url(#linear-gradient)\"/><path d=\"M81.229,128.772l14.237,39.406s1.78,3.687,3.686,3.687,30.255-29.492,30.255-29.492l31.525-60.89L81.737,118.6Z\" fill=\"#c8daea\"/><path d=\"M100.106,138.878l-2.733,29.046s-1.144,8.9,7.754,0,17.415-15.763,17.415-15.763\" fill=\"#a9c6d8\"/><path d=\"M81.486,130.178,52.2,120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229,2.1-2.2,6.489-4.523,120.106-45.36,120.106-45.36s3.208-1.081,5.1-.362a2.766,2.766,0,0,1,1.885,2.055,9.357,9.357,0,0,1,.254,2.585c-.009.752-.1,1.449-.169,2.542-.692,11.165-21.4,94.493-21.4,94.493s-1.239,4.876-5.678,5.043A8.13,8.13,0,0,1,146.1,172.5c-8.711-7.493-38.819-27.727-45.472-32.177a1.27,1.27,0,0,1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6,53.821-51.492c.108-.379-.3-.566-.848-.4-3.482,1.281-63.844,39.4-70.506,43.607A3.21,3.21,0,0,1,81.486,130.178Z\" fill=\"#fff\"/></svg>", "ig": "<svg preserveAspectRatio=\"xMidYMid meet\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\"> <defs> <linearGradient id=\"b\"> <stop offset=\"0\" stop-color=\"#3771c8\"/> <stop stop-color=\"#3771c8\" offset=\".128\"/> <stop offset=\"1\" stop-color=\"#60f\" stop-opacity=\"0\"/> </linearGradient> <linearGradient id=\"a\"> <stop offset=\"0\" stop-color=\"#fd5\"/> <stop offset=\".1\" stop-color=\"#fd5\"/> <stop offset=\".5\" stop-color=\"#ff543e\"/> <stop offset=\"1\" stop-color=\"#c837ab\"/> </linearGradient> <radialGradient id=\"c\" cx=\"158.429\" cy=\"578.088\" r=\"65\" xlink:href=\"#a\" gradientUnits=\"userSpaceOnUse\" gradientTransform=\"matrix(0 -1.98198 1.8439 0 -1031.402 454.004)\" fx=\"158.429\" fy=\"578.088\"/> <radialGradient id=\"d\" cx=\"147.694\" cy=\"473.455\" r=\"65\" xlink:href=\"#b\" gradientUnits=\"userSpaceOnUse\" gradientTransform=\"matrix(.17394 .86872 -3.5818 .71718 1648.348 -458.493)\" fx=\"147.694\" fy=\"473.455\"/> </defs> <path fill=\"url(#c)\" d=\"M65.03 0C37.888 0 29.95.028 28.407.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468C4 13.126 1.5 18.394.595 24.656c-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28 7.79-2.01 14.24-7.29 17.75-14.53 1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624C116.9 4 111.64 1.5 105.372.596 102.335.157 101.73.027 86.19 0H65.03z\" transform=\"translate(1.004 1)\"/> <path fill=\"url(#d)\" d=\"M65.03 0C37.888 0 29.95.028 28.407.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468C4 13.126 1.5 18.394.595 24.656c-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28 7.79-2.01 14.24-7.29 17.75-14.53 1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624C116.9 4 111.64 1.5 105.372.596 102.335.157 101.73.027 86.19 0H65.03z\" transform=\"translate(1.004 1)\"/> <path fill=\"#fff\" d=\"M66.004 18c-13.036 0-14.672.057-19.792.29-5.11.234-8.598 1.043-11.65 2.23-3.157 1.226-5.835 2.866-8.503 5.535-2.67 2.668-4.31 5.346-5.54 8.502-1.19 3.053-2 6.542-2.23 11.65C18.06 51.327 18 52.964 18 66s.058 14.667.29 19.787c.235 5.11 1.044 8.598 2.23 11.65 1.227 3.157 2.867 5.835 5.536 8.503 2.667 2.67 5.345 4.314 8.5 5.54 3.054 1.187 6.543 1.996 11.652 2.23 5.12.233 6.755.29 19.79.29 13.037 0 14.668-.057 19.788-.29 5.11-.234 8.602-1.043 11.656-2.23 3.156-1.226 5.83-2.87 8.497-5.54 2.67-2.668 4.31-5.346 5.54-8.502 1.18-3.053 1.99-6.542 2.23-11.65.23-5.12.29-6.752.29-19.788 0-13.036-.06-14.672-.29-19.792-.24-5.11-1.05-8.598-2.23-11.65-1.23-3.157-2.87-5.835-5.54-8.503-2.67-2.67-5.34-4.31-8.5-5.535-3.06-1.187-6.55-1.996-11.66-2.23-5.12-.233-6.75-.29-19.79-.29zm-4.306 8.65c1.278-.002 2.704 0 4.306 0 12.816 0 14.335.046 19.396.276 4.68.214 7.22.996 8.912 1.653 2.24.87 3.837 1.91 5.516 3.59 1.68 1.68 2.72 3.28 3.592 5.52.657 1.69 1.44 4.23 1.653 8.91.23 5.06.28 6.58.28 19.39s-.05 14.33-.28 19.39c-.214 4.68-.996 7.22-1.653 8.91-.87 2.24-1.912 3.835-3.592 5.514-1.68 1.68-3.275 2.72-5.516 3.59-1.69.66-4.232 1.44-8.912 1.654-5.06.23-6.58.28-19.396.28-12.817 0-14.336-.05-19.396-.28-4.68-.216-7.22-.998-8.913-1.655-2.24-.87-3.84-1.91-5.52-3.59-1.68-1.68-2.72-3.276-3.592-5.517-.657-1.69-1.44-4.23-1.653-8.91-.23-5.06-.276-6.58-.276-19.398s.046-14.33.276-19.39c.214-4.68.996-7.22 1.653-8.912.87-2.24 1.912-3.84 3.592-5.52 1.68-1.68 3.28-2.72 5.52-3.592 1.692-.66 4.233-1.44 8.913-1.655 4.428-.2 6.144-.26 15.09-.27zm29.928 7.97c-3.18 0-5.76 2.577-5.76 5.758 0 3.18 2.58 5.76 5.76 5.76 3.18 0 5.76-2.58 5.76-5.76 0-3.18-2.58-5.76-5.76-5.76zm-25.622 6.73c-13.613 0-24.65 11.037-24.65 24.65 0 13.613 11.037 24.645 24.65 24.645C79.617 90.645 90.65 79.613 90.65 66S79.616 41.35 66.003 41.35zm0 8.65c8.836 0 16 7.163 16 16 0 8.836-7.164 16-16 16-8.837 0-16-7.164-16-16 0-8.837 7.163-16 16-16z\"/> </svg>", "fb": "<svg preserveAspectRatio=\"xMidYMid meet\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\" viewBox=\"0 0 40 40\"> <linearGradient id=\"a\" x1=\"-277.375\" x2=\"-277.375\" y1=\"406.6018\" y2=\"407.5726\" gradientTransform=\"matrix(40 0 0 -39.7778 11115.001 16212.334)\" gradientUnits=\"userSpaceOnUse\"> <stop offset=\"0\" stop-color=\"#0062e0\"/> <stop offset=\"1\" stop-color=\"#19afff\"/> </linearGradient> <path fill=\"url(#a)\" d=\"M16.7 39.8C7.2 38.1 0 29.9 0 20 0 9 9 0 20 0s20 9 20 20c0 9.9-7.2 18.1-16.7 19.8l-1.1-.9h-4.4l-1.1.9z\"/> <path fill=\"#fff\" d=\"m27.8 25.6.9-5.6h-5.3v-3.9c0-1.6.6-2.8 3-2.8H29V8.2c-1.4-.2-3-.4-4.4-.4-4.6 0-7.8 2.8-7.8 7.8V20h-5v5.6h5v14.1c1.1.2 2.2.3 3.3.3 1.1 0 2.2-.1 3.3-.3V25.6h4.4z\"/> </svg>", "x": "<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"12\" fill=\"#000\"/><path fill=\"#fff\" transform=\"translate(5.50,6.13) scale(0.0433)\" d=\"m236 0h46l-101 115 118 156h-92.6l-72.5-94.8-83 94.8h-46l107-123-113-148h94.9l65.5 86.6zm-16.1 244h25.5l-165-218h-27.4z\"/></svg>", "ml": "<svg preserveAspectRatio=\"xMidYMid meet\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"52 42 88 66\"> <path fill=\"#4285f4\" d=\"M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6\"/> <path fill=\"#34a853\" d=\"M120 108h14c3.32 0 6-2.69 6-6V59l-20 15\"/> <path fill=\"#fbbc04\" d=\"M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2\"/> <path fill=\"#ea4335\" d=\"M72 74V48l24 18 24-18v26L96 92\"/> <path fill=\"#c5221f\" d=\"M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2\"/> </svg>", "sms": "<svg preserveAspectRatio=\"xMidYMid meet\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"> <path fill=\"#86A9FF\" d=\"M58.639,123.429C26.222,123.429,0,95.767,0,61.714S26.222,0,58.639,0h61.008 c32.417,0,58.639,27.662,58.639,61.714s-26.222,61.714-58.639,61.714H58.639z\"/> <path fill=\"#578CFF\" d=\"M98.181,148.368V186c0,3.274-2.637,6-5.798,6c-1.547-0.011-3.022-0.651-4.087-1.773l-57.189-58.903 c-11.201-11.451-17.393-27.13-17.393-43.358c0-33.405,26.222-60.538,58.639-60.538h61.008c32.417,0,58.639,27.134,58.639,60.538 s-26.222,60.538-58.639,60.538H98.181V148.368z\"/> <path fill=\"#0057CC\" d=\"M58.354,123.429h61.155c32.493,0,58.776-28.303,58.776-63.147c0-4.125-0.398-8.105-1.056-12.089 c-10.697-12.799-26.283-20.763-43.587-20.763H72.49c-32.493,0-58.776,28.303-58.776,63.147c0,4.125,0.398,8.105,1.056,11.945 c10.697,12.799,26.283,20.907,43.587,20.907H58.354z\"/> </svg>", "sn": "<svg viewBox=\"-4 -4 32 32\"><circle cx=\"12\" cy=\"12\" r=\"16\" fill=\"#FFFC00\"/><path d=\"M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z\" fill=\"#fff\" stroke=\"#16161a\" stroke-width=\".7\"/></svg>"};
  const gsvg = (k) => BRIMG[k] || (BR[k]
    ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + BR[k] + '"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (GL[k] || ICON[k] || '') + '</svg>');
  // 🖼️ v640 — أمر عمران «صورة خاليّة»: واتساب لا يُظهر أيّ رابط صورةً نقيّة —
  //    يبني بطاقة معاينة + سطر دومين من عنده (لا يُخفى). الطريق الوحيد لصورة
  //    نقيّة: إرسال الملفّ نفسه (Web Share Level 2). كروم أندرويد يدعمه، فإن
  //    رفض المتصفّح (canShare=false) نرجع للرابط كما كان تمامًا — صفر خسارة.
  const fileOf = () => {
    const bl = toBlob(dataUrl);
    const ty = bl.type || 'image/png';
    const ext = ty === 'image/jpeg' ? '.jpg' : (ty === 'image/webp' ? '.webp' : '.png');
    return new File([bl], 'image-' + Date.now() + ext, { type: ty });
  };
  // 🩹 v642 — أمر عمران: الرابط ما زال يُرسَل. العيب في كودي: كنت أشترط
  //    canShare قبل الإرسال، ومقيس سابقًا (v625) أنّها ترجع false كذبًا في
  //    متصفّحات تدعم share بالملفّات فعلًا ⇒ يسقط الكود للرابط. الآن:
  //    أُرسل الملفّ بلا شرط، وألتقط الرفض، ولا أرسل رابطًا أبدًا — بدله
  //    تُحفظ الصورة في «التنزيلات» لتُرفَق يدويًّا. وسبب الرفض يُعلَن لا يُبلَع.
  let __shF = null;
  const fileOnce = () => {
    if(!__shF){ try{ __shF = fileOf(); }catch(e){ __swallow(e, 'fileOnce:app-09-attach#v642'); __shF = null; } }
    return __shF;
  };
  const filePossible = () => {
    try{
      const nv = navigator;
      if(typeof File !== 'function' || typeof nv.share !== 'function') return false;
      const f = fileOnce();
      if(!f) return false;
      if(typeof nv.canShare === 'function'){ try{ if(nv.canShare({ files: [f] })) return true; }catch(e){ /* guard-ok — canShare() may throw on some browsers */ } }
      return true;
    }catch(e){ __swallow(e, 'filePossible:app-09-attach#v642'); }
    return false;
  };
  const saveOpen = (t) => {
    let bl = null;
    try{ bl = toBlob(dataUrl); }catch(e){ __swallow(e, 'saveOpen:app-09-attach#v642'); }
    const nm = (t && t.n) ? t.n : (ar ? 'التطبيق' : 'the app');
    if(saveDl(bl)){
      note(ar ? ('حُفظت الصورة في «التنزيلات» — أرفقها في ' + nm) : ('Saved to Downloads — attach it in ' + nm));
      return true;
    }
    hint(bl);
    return false;
  };
  const nativeBridgeShare = () => {
    try{
      if(typeof omranNativeBridge !== 'function' || !omranNativeBridge('omranShare')) return false;
      const bl = toBlob(dataUrl);
      if(!bl) return false;
      if(typeof msgDownloadBlob === 'function'){ msgDownloadBlob(bl, nmOf()); return true; }
    }catch(e){ __swallow(e, 'bridgeShare:app-09-attach#v-share-bridge'); }
    return false;
  };
  /* غلاف WebView (تطبيق المتجر بلا جسر): روابط intent: لا تُنفَّذ فيه — نفتح ورقتنا فورًا بلا انتظار */
  const inWebView = () => { try{ const ua = navigator.userAgent || ''; return /\bwv\b/.test(ua) || /Version\/\d+\.\d+.*Chrome\//.test(ua) || !!window.OmranAndroidShare; }catch(e){ return false; } };
  const shareFile = (onFail) => {
    const nv = navigator;
    if(typeof File !== 'function' || typeof nv.share !== 'function') return false;
    const f = fileOnce();
    if(!f) return false;
    try{
      const pr = nv.share({ files: [f] });
      if(pr && pr.catch) pr.catch((e) => {
        if(e && e.name === 'AbortError') return;
        __why = 'file:' + ((e && (e.name || e.message)) || '?');
        __swallow(e, 'shareFile:app-09-attach#v642');
        note((ar ? 'رفض المتصفّح إرسال الملفّ' : 'Browser refused the file') + ' — ' + ((e && (e.name || e.message)) || '?'));
        if(typeof onFail === 'function') onFail();
      });
      return true;
    }catch(e){
      __swallow(e, 'shareFile:app-09-attach#v642');
      try{ note((ar ? 'رفض المتصفّح إرسال الملفّ' : 'Browser refused the file') + ' — ' + ((e && (e.name || e.message)) || '?')); }catch(_){ /* guard-ok — cleanup, intentional */ }
    }
    return false;
  };
  let shUrl = '', shBusy = null, __shW = 0, __shH = 0, __why = '';
  // v653 — نسخ الصورة تلقائيًّا للحافظة على متصفّحات بلا Web Share (هواوي):
  //    المستخدم يلصقها في واتساب فتصل صورةً لا رابطًا. الحافظة تضمن PNG فقط.
  const pngBlob = () => new Promise((res, rej) => {
    try{
      const bl = toBlob(dataUrl);
      if((bl.type || '') === 'image/png'){ res(bl); return; }
      const im = new Image();
      im.onload = () => {
        try{
          const c = document.createElement('canvas');
          c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
          c.getContext('2d').drawImage(im, 0, 0);
          c.toBlob((o) => { if(o) res(o); else rej(new Error('toBlob')); }, 'image/png');
        }catch(e){ rej(e); }
      };
      im.onerror = () => rej(new Error('img-load'));
      im.src = dataUrl;
    }catch(e){ rej(e); }
  });
  const autoCopy = () => {
    try{
      if(!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem)) return Promise.resolve(false);
      // Safari: الـ Promise يُمرّر داخل ClipboardItem لا قبله — وإلّا ضاع إذن النقرة
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })])
        .then(() => true).catch((e) => { __swallow(e, 'autoCopy:app-09-attach#v653'); return false; });
    }catch(e){ __swallow(e, 'autoCopy:app-09-attach#v653'); return Promise.resolve(false); }
  };
  const cpTxt = (t) => {
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t); return true; } }catch(e){ __swallow(e, 'cpTxt:app-09-attach#v627'); }
    try{
      const ta = document.createElement('textarea'); ta.value = t;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      return true;
    }catch(e){ __swallow(e, 'cpTxt:app-09-attach#v627'); }
    return false;
  };
  const shrink = (du) => new Promise((res) => {
    try{
      const im = new Image();
      im.onload = () => {
        try{
          const M = 1600, w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
          const k = Math.min(1, M / Math.max(w0 || 1, h0 || 1));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round((w0 || 1) * k)); c.height = Math.max(1, Math.round((h0 || 1) * k));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          __shW = c.width; __shH = c.height; // v649 — أبعاد للمعاينة الكبيرة
          res(c.toDataURL('image/jpeg', 0.9));
        }catch(e){ __swallow(e, 'shrink:app-09-attach#v627'); res(du); }
      };
      im.onerror = () => res(du);
      im.src = du;
    }catch(e){ __swallow(e, 'shrink:app-09-attach#v627'); res(du); }
  });
  const upload = () => {
    if(shUrl) return Promise.resolve(shUrl);
    if(shBusy) return shBusy;
    shBusy = (async () => {
      try{
        const du = await shrink(dataUrl);
        const i = du.indexOf(',');
        const r = await fetch('/api/media?action=img', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: du.slice(i + 1), mime: (du.slice(5).split(';')[0] || 'image/jpeg'), w: __shW || undefined, h: __shH || undefined })
        });
        const j = await r.json();
        if(j && j.url) shUrl = location.origin + j.url;
      }catch(e){ __swallow(e, 'upload:app-09-attach#v627'); }
      shBusy = null;
      return shUrl;
    })();
    return shBusy;
  };
  const sheetCss = () => {
    if(document.getElementById('oShCss')) return;
    const st = document.createElement('style'); st.id = 'oShCss';
    st.textContent = '.oShOv{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.58);display:flex;align-items:flex-end;justify-content:center}'
      + '.oShSh{width:100%;max-width:520px;background:#15171b;color:#f1f2f4;border:1px solid rgba(255,255,255,.09);border-bottom:0;border-radius:20px 20px 0 0;padding:16px 16px 20px;box-shadow:0 -20px 60px rgba(0,0,0,.55);animation:oShUp .2s ease}'
      + '@keyframes oShUp{from{transform:translateY(24px);opacity:.3}to{transform:none;opacity:1}}'
      + '.oShHd{display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:600;margin:0 2px 4px}'
      + '.oShX{background:0;border:0;color:inherit;opacity:.65;font-size:15px;cursor:pointer;padding:4px 6px;font-family:inherit}'
      + '.oShS{font-size:12px;opacity:.55;margin:0 2px 13px}'
      + '.oShGr{display:grid;grid-template-columns:repeat(4,1fr);gap:15px 4px;margin-bottom:15px}'
      + '.oShT{display:flex;flex-direction:column;align-items:center;gap:7px;background:0;border:0;padding:0;color:inherit;font-family:inherit;font-size:11.5px;cursor:pointer}'
      + '.oShT i{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:999px;background:rgba(255,255,255,.085);border:1px solid rgba(255,255,255,.07);transition:transform .12s}'
      + '.oShT i svg{width:24px;height:24px}'
      + '.oShT i svg[preserveAspectRatio],.oShT i svg[viewBox]{width:46px;height:46px;border-radius:12px}'
      + '.oShT:active i{transform:scale(.92)}'
      + '.oShAc{display:grid;gap:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:13px}'
      + '.oShA{display:flex;align-items:center;gap:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-radius:13px;color:inherit;font-family:inherit;font-size:14.5px;padding:12px 14px;cursor:pointer;text-align:start}'
      + '.oShA svg{width:20px;height:20px;flex:none;opacity:.85}'
      + '.oShA:active{transform:scale(.99)}'
      + 'html[data-mode="light"] .oShSh{background:#fff;color:#14161a;border-color:rgba(0,0,0,.1)}'
      + 'html[data-mode="light"] .oShT i,html[data-mode="light"] .oShA{background:rgba(0,0,0,.045);border-color:rgba(0,0,0,.085)}';
    document.head.appendChild(st);
  };
  const openSheet = () => {
    sheetCss();
    try{ if(!filePossible()) upload(); }catch(e){ __swallow(e, 'preupload:app-09-attach#v643'); }
    const ov = document.createElement('div'); ov.className = 'oShOv';
    const sh = document.createElement('div'); sh.className = 'oShSh';
    ov.appendChild(sh);
    const esc = (e) => { if(e.key === 'Escape') close(); };
    const close = () => { try{ ov.remove(); }catch(e){ /* guard-ok — cleanup: remove overlay */ } document.removeEventListener('keydown', esc); };
    ov.onclick = (e) => { if(e.target === ov) close(); };
    document.addEventListener('keydown', esc);
    const hd = document.createElement('div'); hd.className = 'oShHd';
    hd.innerHTML = '<span>' + (ar ? 'إرسال الصورة' : 'Send image') + '</span>';
    const xb = document.createElement('button'); xb.type = 'button'; xb.className = 'oShX';
    xb.textContent = ar ? 'إغلاق' : 'Close'; xb.onclick = close; hd.appendChild(xb);
    sh.appendChild(hd);
    const stx = document.createElement('p'); stx.className = 'oShS';
    stx.textContent = filePossible()
      ? (ar ? 'تُرسَل الصورة ملفًّا — بلا رابط ولا بطاقة' : 'Sent as a file — no link, no card')
      : (ar ? 'سيُرسَل رابط الصورة مباشرةً للتطبيق الذي تختاره' : 'A direct image link will be sent to the app you pick');
    sh.appendChild(stx);
    /* v-share-bridge: سطر التشخيص (no-share-api • Chrome …) أُزيل من ورقة المستخدم — أدّى غرضه */
    const gr = document.createElement('div'); gr.className = 'oShGr'; sh.appendChild(gr);
    const go = (t) => {
      // v643 — الملفّ أوّلًا إن أمكن؛ وإلّا نرسل رابط الصورة مباشرةً لتطبيق
      //    الوجهة (wa.me / mailto...) بدل حفظها كتنزيل — التنزيل صار آخر حلّ.
      if(filePossible()){ if(shareFile(() => saveOpen(t))){ close(); return; } saveOpen(t); return; }
      if(t.copy){
        if(shUrl){ if(cpTxt(shUrl)) note(t.copy); else saveOpen(t); close(); return; }
        upload().then((u) => { if(u && cpTxt(u)) note(t.copy); else saveOpen(t); });
        close(); return;
      }
      if(t.u){
        if(shUrl){ try{ window.open(t.u(shUrl), '_blank'); close(); return; }catch(e){ __swallow(e, 'go:app-09-attach#v643'); } }
        else {
          let w = null; try{ w = window.open('', '_blank'); }catch(e){ __swallow(e, 'go:app-09-attach#v643'); }
          upload().then((u) => {
            if(u){ if(w){ try{ w.location = t.u(u); return; }catch(e){ __swallow(e, 'go:app-09-attach#v643'); } } try{ window.open(t.u(u), '_blank'); return; }catch(e){ __swallow(e, 'go:app-09-attach#v643'); } }
            try{ if(w) w.close(); }catch(_){ /* guard-ok — cleanup popup ref */ }
            saveOpen(t);
          });
          close(); return;
        }
      }
      saveOpen(t);
    };
    APPS.forEach((t) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'oShT';
      b.innerHTML = '<i>' + gsvg(t.g) + '</i><span>' + t.n + '</span>';
      // v650 — الشعار الرسمي يحمل ألوانه بنفسه؛ بلا خلفية ملونة مرسومة
      if(BRIMG[t.g]){ const ic = b.querySelector('i'); ic.style.background = 'transparent'; ic.style.borderColor = 'transparent'; }
      else if(t.c){ const ic = b.querySelector('i'); ic.style.background = t.c; ic.style.borderColor = 'transparent'; ic.style.color = t.fg || '#fff'; }
      b.setAttribute('aria-label', t.n);
      b.onclick = () => go(t);
      gr.appendChild(b);
    });
    const ac = document.createElement('div'); ac.className = 'oShAc'; sh.appendChild(ac);
    const act = (label, ic, fn) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'oShA';
      b.innerHTML = gsvg(ic) + '<span>' + label + '</span>';
      b.onclick = () => fn(b);
      ac.appendChild(b);
      return b;
    };
    act(ar ? 'مشاركة عبر تطبيقات الجهاز' : 'Share via device apps', 'share', () => {
      if(nativeBridgeShare()){ close(); return; }
      // v642 — الملفّ فقط. إن رفضه المتصفّح تُحفظ الصورة — لا يُشارَك رابط.
      if(shareFile(() => saveOpen(null))){ close(); return; }
      saveOpen(null);
    });
    act(ar ? 'نسخ رابط الصورة' : 'Copy image link', 'lnk', () => {
      const run = (l) => { if(l && cpTxt(l)) note(ar ? 'نُسخ الرابط' : 'Link copied'); else note(ar ? 'تعذّر تحضير الرابط' : 'Link failed'); };
      if(shUrl) run(shUrl); else upload().then(run);
    });
    act(ar ? 'تنزيل الصورة' : 'Download image', 'dl', () => {
      let bl = null;
      try{ bl = toBlob(dataUrl); }catch(e){ __swallow(e, 'dl:app-09-attach#v627'); }
      if(saveDl(bl)){ note(ar ? 'حُفظت الصورة في «التنزيلات»' : 'Saved to Downloads'); close(); return; }
      hint(bl);
    });
    act(ar ? 'نسخ الصورة' : 'Copy image', 'img', (b) => {
      let bl = null;
      try{ bl = toBlob(dataUrl); }catch(e){ __swallow(e, 'cpimg:app-09-attach#v627'); }
      copyImg(b, bl);
    });
    // v653 — أندرويد بمتصفّح بلا Web Share: زرّ يفتح الصفحة في كروم حيث
    //    قائمة النظام الحقيقية تعمل كاملة (نشاط كروم يعلن BROWSABLE).
    try{
      if(/android/i.test(navigator.userAgent || '') && typeof navigator.share !== 'function' && !inWebView()){
        act(ar ? 'فتح الموقع في متصفّح كروم' : 'Open in Chrome', 'share', () => {
          const u = new URL(location.href); u.hash = '';
          const tg = u.host + u.pathname + u.search;
          location.href = 'intent://' + tg + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(u.href) + ';end';
        });
      }
    }catch(_){ /* guard-ok — overlay close cleanup */ }
    document.body.appendChild(ov);
  };
  // يمين: «تعديل» نصّ فقط
  mk('txt', '<span>' + (ar ? 'تعديل' : 'Edit') + '</span>', ar ? 'تعديل' : 'Edit', (b) => {
    pendingAttachments.push({ name: 'edit-' + Date.now() + '.png', isImage: true, mime: dataUrl.slice(5).split(';')[0] || 'image/png', dataUrl: dataUrl });
    renderAttachStrip();
    flash(b, '<span>' + (ar ? 'جاهزة' : 'Ready') + '</span>');
    const p = $('#prompt'); if(p){ p.focus(); p.placeholder = ar ? 'اكتب التعديل المطلوب على هذي الصورة…' : 'Describe the edit you want…'; }
  });
  // 🔄 «نسخة ثانية» — يعيد آخر طلب صورة بضغطة، تنويعة جديدة بلا إعادة كتابة (طلب المالك)
  if(window.__omranLastImageReq){
    mk('txt', '<span>🔄 ' + (ar ? 'نسخة ثانية' : 'Another') + '</span>', ar ? 'نسخة ثانية' : 'Another version', (b) => {
      if(!window.__omranLastImageReq){ flash(b, '<span>—</span>'); return; }
      if(typeof genAbortController !== 'undefined' && genAbortController){ flash(b, '<span>' + (ar ? 'انتظر…' : 'Wait…') + '</span>'); return; }
      flash(b, '<span>⏳</span>');
      try{ window.omranAnotherVersion && window.omranAnotherVersion(); }catch(e){ __swallow(e, 'img:another-btn'); }
    });
  }
  // 📤 v635 — أمر عمران «زرّ الإرسال حطه هني جنبهم»: الإرسال يسكن شريط أزرار
  // الرسالة نفسه (بعد النسخ/الإعجاب) بنفس شكلهم وحجمهم؛ «تعديل» يبقى تحت الصورة.
  // رسالة الصورة بلا نصّ لا تبني شريطًا ⇒ أُنشئ شريطًا بنفس الصنف.
  // 🩹 v636 — تصحيح v635: شريط أزرار الرسالة **أخٌ** للفقاعة لا ابنٌ لها
  //    (app-04-i18n-state: bubbleCol ← [الفقاعة, msgActionBar]) ⇒ البحث داخل
  //    الفقاعة يعيد null فيُبنى صفٌّ وحيد فوق الشريط. الآن أبحث في الأب أوّلًا،
  //    ولا أبني صفًّا بديلًا إلّا إن لم يوجد شريط أصلًا (صورة بلا نصّ).
  const findBar = (mb) => {
    const p = mb.parentNode;
    if(p && p.children){
      for(let i = 0; i < p.children.length; i++){
        const c = p.children[i];
        if(c !== mb && c.classList && c.classList.contains('msgActionBar')) return c;
      }
    }
    return mb.querySelector ? mb.querySelector('.msgActionBar') : null;
  };
  const mountSend = (last) => {
    const mb = wrap.closest && wrap.closest('.msg');
    if(!mb || mb.__oSendMounted) return;
    const abar = findBar(mb);
    if(!abar && !last) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'oSendOut';
    b.title = ar ? 'إرسال الصورة' : 'Send image';
    b.setAttribute('aria-label', b.title);
    b.innerHTML = svg('share');
    b.onclick = (e) => {
      if(e && e.stopPropagation) e.stopPropagation();
      /* v-share-bridge (صورة المالك ٤ سبتمبر: «share-api:no» داخل تطبيق المتجر): غلاف المتجر
         (أندرويد/آيفون) بلا navigator.share لكنه يوفّر جسر omranShare — ورقة مشاركة النظام
         الحقيقية بالملف نفسه. المسار الأول قبل أي شيء. */
      if(nativeBridgeShare()) return;
      // v646 — أمر عمران: زرّ الإرسال يفتح ورقة النظام (تطبيقات الجهاز الحقيقية)
      //    مباشرةً — الملفّ إن أمكن، وإلّا الرابط. ورقتنا تبقى حلًّا أخيرًا فقط.
      if(filePossible() && shareFile(() => openSheet())) return;
      if(navigator.share){
        // v648 — الرابط يُجهَّز مسبقًا فتُطلب ورقة النظام داخل نقرة المستخدم نفسها؛
        //    الانتظار بعد النقرة كان يُفقد إذن الإيماءة فترتدّ ورقتنا كأن شيئًا لم يتغيّر.
        if(shUrl){
          try{
            const pr0 = navigator.share({ title: 'عمران AI', url: shUrl });
            if(pr0 && pr0.catch) pr0.catch((err) => {
              if(err && err.name === 'AbortError') return;
              __why = 'url:' + ((err && (err.name || err.message)) || '?');
              __swallow(err, 'nativeShare:app-09-attach#v648');
              openSheet();
            });
            return;
          }catch(err){ __swallow(err, 'nativeShare:app-09-attach#v648'); }
        }
        upload().then((u) => {
          if(!u){ __why = 'upload-failed'; openSheet(); return; }
          try{
            const pr = navigator.share({ title: 'عمران AI', url: u });
            if(pr && pr.catch) pr.catch((err) => {
              if(err && err.name === 'AbortError') return;
              __why = 'url:' + ((err && (err.name || err.message)) || '?');
              __swallow(err, 'nativeShare:app-09-attach#v646');
              openSheet();
            });
          }catch(err){ __why = 'url-sync:' + ((err && (err.name || err.message)) || '?'); __swallow(err, 'nativeShare:app-09-attach#v646'); openSheet(); }
        });
        return;
      }
      // v647 — متصفّحات بلا navigator.share (متصفّح هواوي مثلًا): نفتح ورقة
      //    النظام عبر intent أندرويد؛ إن حُجب الانتقال تنفتح ورقتنا بعد ثانية.
      const tryIntent = (u) => {
        try{
          if(!/android/i.test(navigator.userAgent || '') || inWebView()) return false;
          setTimeout(() => { try{ if(!document.hidden) openSheet(); }catch(_){ /* guard-ok — delayed openSheet, suppress if dismissed */ } }, 1200);
          location.href = 'intent:#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.TEXT=' + encodeURIComponent(u) + ';end';
          return true;
        }catch(err){ __swallow(err, 'intentShare:app-09-attach#v647'); }
        return false;
      };
      __why = 'no-share-api';
      // v653 — قبل فتح ورقتنا: انسخ الصورة نفسها للحافظة ليلصقها المستخدم صورةً
      try{ autoCopy().then((ok) => { if(ok) note(ar ? 'نُسخت الصورة تلقائيًّا — الصقها داخل المحادثة بعد فتح التطبيق' : 'Image copied — paste it after opening the app'); }); }catch(_){ /* guard-ok — cleanup, intentional */ }
      if(shUrl){ if(tryIntent(shUrl)) return; openSheet(); return; }
      upload().then((u) => { if(u && tryIntent(u)) return; openSheet(); });
    };
    if(abar) abar.appendChild(b);
    else {
      const nb = document.createElement('div'); nb.className = 'msgActionBar oSendBar';
      nb.appendChild(b);
      if(mb.parentNode) mb.parentNode.appendChild(nb); else mb.appendChild(nb);
    }
    mb.__oSendMounted = 1;
    // v648 — تجهيز رابط المشاركة فور ظهور الزرّ حتى تكون النقرة فوريّة
    try{ if(navigator.share && !filePossible()) upload(); }catch(err){ __swallow(err, 'prewarm:app-09-attach#v648'); }
  };
  setTimeout(() => mountSend(false), 0);
  setTimeout(() => mountSend(false), 200);
  setTimeout(() => mountSend(true), 800);
  wrap.classList.add('oImgBox');
  // 🧊 v583 — الصورة تعيش داخل صندوق المحادثة، لا سابحة خارجه (أمر عمران).
  // وقت الاستدعاء يكون العنصر خارج شجرة الصفحة ⇒ closest = null، فيلزم وسم مؤجَّل.
  const __markBox = () => { try{ const __mb = wrap.closest && wrap.closest('.msg.assistant'); if(__mb) __mb.classList.add('oImgMsg'); }catch(e){ /* guard-ok — DOM query, element may be detached */ } };
  __markBox(); setTimeout(__markBox, 0);
  wrap.style.position = 'relative'; wrap.__imgTools = 1;
  try{
    const im = wrap.querySelector('img');
    const r = im ? getComputedStyle(im).borderRadius : '';
    // 🔓 v635 — overflow:hidden كان يقصّ صفّ «تعديل» تحت الصورة. الصورة نفسها
    //    تحمل border-radius من CSS ⇒ لا حاجة لقصّ الحاوية.
    if(r && r !== '0px'){ wrap.style.borderRadius = r; }
  }catch(e){ /* guard-ok — style cleanup */ }
  bar.classList.add('inImg'); // v668: رجوع زر «تعديل» داخل الصورة مثل v641 — شكوى عمران كانت عن نص الصورة المولّدة نفسها
  wrap.appendChild(bar);
};

function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscale + recompress an image before it ever touches localStorage or the
// network. Phone photos can be 3-10MB, which blows past localStorage quotas
// and provider payload limits, silently killing the whole send. We cap the
// longest side at 1280px and re-encode as JPEG (unless it's a PNG with
// transparency, which we keep as PNG) at moderate quality.
/* v-img-fast (شكوى المالك: «الكينج HTTP 400» مع صورة + «المحادثة أسرع»):
   كانت الصورة حتى 3.5MB تمر خامًا — رفعها على شبكة الجوال ياخذ دقيقة كاملة
   قبل أن يبدأ الرد، وقد تتجاوز حدود مزوّد الرؤية فيرد 400 ويضيع وقت التحويل.
   والموثّق أن كلود يصغّر أي صورة أطول من ~1568px على خادمه أصلًا — فالإرسال
   الأكبر هدر محض بلا أي مكسب جودة عند النموذج. 1568px + JPEG 85% تعطي نفس
   ما يراه النموذج بحجم ~200-400KB بدل عدة ميغا. */
const IMAGE_MAX_DIMENSION = 1568;
const IMAGE_JPEG_QUALITY = 0.85;
const IMAGE_PASSTHROUGH_BYTES = 900 * 1024; // send as-is, zero re-encode
// v381: نسخة مضغوطة للمزامنة بين الأجهزة (400px, JPEG 40%)
const SERVER_THUMB_MAX = 400;
const SERVER_THUMB_QUALITY = 0.4;
function makeServerThumb(dataUrl){
  return new Promise(function(resolve){
    try{
      var img = new Image();
      img.onload = function(){
        try{
          var w = img.width, h = img.height;
          var scale = Math.min(1, SERVER_THUMB_MAX / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', SERVER_THUMB_QUALITY));
        }catch(e){ resolve(''); }
      };
      img.onerror = function(){ resolve(''); };
      img.src = dataUrl;
    }catch(e){ resolve(''); }
  });
}
window.makeServerThumb = makeServerThumb;
function resizeImageFile(file){
  return new Promise((resolve, reject) => {
    // Small enough: pass through untouched for perfect color fidelity
    if (file.size <= IMAGE_PASSTHROUGH_BYTES && (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp')){
      const fr = new FileReader();
      fr.onload = () => {
        // v-visual-assist: الأبعاد الأصلية مطلوبة لكشف لقطات الشاشة حتى في مسار التمرير
        try{
          const im = new Image();
          im.onload = () => resolve({ dataUrl: fr.result, mime: file.type, width: im.naturalWidth || im.width, height: im.naturalHeight || im.height });
          im.onerror = () => resolve({ dataUrl: fr.result, mime: file.type });
          im.src = fr.result;
        }catch(_e){ resolve({ dataUrl: fr.result, mime: file.type }); }
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try{
        let { width, height } = img;
        const __ow = width, __oh = height;
        const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const keepPng = file.type === 'image/png' || file.type === 'image/gif';
        const mime = keepPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, keepPng ? undefined : IMAGE_JPEG_QUALITY);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, mime, width: __ow, height: __oh });
      }catch(err){
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}
function readFileAsText(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

$('#btnAttach').onclick = () => $('#attachInput').click();

// ---- Emoji picker ----
const EMOJI_LIST = [
  '😀','😁','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘','😗','😙','😚','😋',
  '😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤨','😐','😑','😶','🙄','😏','😣',
  '😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😷','🤒','🤕','🤢','🤮','🤧',
  '🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮\u200d💨','😲','😳',
  '🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','😤',
  '😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👽','🤖','🎃','😺','😸','😹','😻',
  '😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️',
  '💕','💞','💓','💗','💖','💘','💝','💟','💯','💢','💥','💫','💦','💨','🕳️','💣',
  '👍','👎','👏','🙌','🙏','👋','🤝','💪','✌️','🤞','🤟','🤘','👌','🤌','✊','👊',
  '😽','💋','😙','😚','🎉','🎊','🎁','🔥','⭐','🌟','✨','💐','🌹','🌸','🍕','🍔',
  '🍟','🍰','🎂','☕','🍺','⚽','🏀','🎮','📱','💻','📸','🎵','🎶','✅','❌','⚠️'
];
const emojiPickerEl = $('#emojiPicker');
emojiPickerEl.innerHTML = EMOJI_LIST.map(e => `<span class="em">${e}</span>`).join('');
emojiPickerEl.addEventListener('click', e => {
  const t = e.target.closest('.em');
  if (!t) return;
  const promptEl = $('#prompt');
  // v-old-webview (رفض هواوي 4.1 على EMUI 8.1/10): «??» و«?.» صياغة لا تفهمها
  // متصفحات الأجهزة القديمة فتموت الحزمة كلها ويبقى للمراجع شاشة واحدة.
  const start = (promptEl.selectionStart != null) ? promptEl.selectionStart : promptEl.value.length;
  const end = (promptEl.selectionEnd != null) ? promptEl.selectionEnd : promptEl.value.length;
  promptEl.value = promptEl.value.slice(0, start) + t.textContent + promptEl.value.slice(end);
  const newPos = start + t.textContent.length;
  promptEl.focus();
  promptEl.setSelectionRange(newPos, newPos);
  promptEl.dispatchEvent(new Event('input', {bubbles:true}));
});
$('#btnEmoji').onclick = (e) => {
  e.stopPropagation();
  // v207: أغلق قائمة ⋮ أولًا حتى لا تتداخل لوحة الإيموجي فوقها
  const ptp = document.getElementById('plusToolsPopup');
  if(ptp) ptp.classList.remove('show');
  emojiPickerEl.classList.toggle('open');
};
document.addEventListener('click', (e) => {
  if (emojiPickerEl.classList.contains('open') && !emojiPickerEl.contains(e.target) && e.target.id !== 'btnEmoji') {
    emojiPickerEl.classList.remove('open');
  }
});
// Uploads a file directly to Vercel Blob storage from the browser (bypassing
// our serverless function body-size limits) using a short-lived client token
// minted by /api/blob-client-upload, then returns the public blob URL.
async function uploadFileToBlob(file){
  const { upload } = await import('https://esm.sh/@vercel/blob@0.27.1/client');
  const blob = await upload(file.name, file, {
    access: 'public',
    handleUploadUrl: '/api/blob-client-upload',
  });
  return blob.url;
}

// Archives (.zip/.docx/.xlsx/.pptx/.jar are all ZIP containers under the
// hood) are uploaded then unpacked server-side by /api/analyze-zip, which
// extracts readable text/code so every AI provider can actually read what's
// inside instead of seeing raw binary garbage.
// v402: الأرشيف يُرسَل مع الطلب مباشرة بدل الرفع لتخزين خارجي.
//
// المسار القديم كان: المتصفح → Vercel Blob → رابط → /api/analyze-zip.
// لكن Vercel Blob عُلِّق و/api/blob-client-upload صار يرجع 503 عمدًا، فانقطعت
// الخطوة الأولى وتوقّفت الميزة كلها. الحد الجديد ~3 م.ب لأن جسم دالة Vercel
// محدود — وهو يكفي مشروع كود، لا مشروعًا مليئًا بالصور.
const MAX_ARCHIVE_DIRECT_BYTES = 3 * 1024 * 1024;

/* v412 — قراءة مجزّأة بدل FileReader.readAsDataURL:
 * ① arrayBuffer() يرمي خطأً يحمل اسمه وسببه (بدل onerror الصامت).
 * ② التحويل على أجزاء 32 ك.ب يبقي الذاكرة منخفضة. */
async function fileToBase64(file){
  let buf;
  try {
    buf = await file.arrayBuffer();
  } catch (e) {
    const why = (e && (e.name || e.message)) ? (' (' + (e.name || e.message) + ')') : '';
    throw new Error('تعذّر قراءة الملف' + why +
      '. تأكد أنه محمّل على جهازك فعلًا وليس على السحابة فقط، ثم أعد المحاولة.');
  }
  if (!buf || !buf.byteLength) throw new Error('الملف فارغ أو تعذّر فتحه.');
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/* v412 — فكّ الأرشيف في المتصفح: يزيل حدّ الـ3 م.ب كليًا. بدل إرسال الأرشيف
 * كاملًا للخادم، نرسل النص المستخرج فقط (الصور والثنائيات وnode_modules
 * و.git تُستبعد أصلًا — مشروع 20 م.ب قد يصير 200 ك.ب نصًّا مفيدًا). */
async function unzipInBrowser(file){
  if(!window.JSZip){
    await new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      sc.onload = res; sc.onerror = () => rej(new Error('تعذّر تحميل أداة فكّ الضغط. تحقّق من الاتصال.'));
      document.head.appendChild(sc);
    });
  }
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const TEXT = /\.(txt|md|markdown|js|jsx|ts|tsx|mjs|cjs|json|html?|css|scss|less|py|rb|php|java|c|cpp|h|hpp|cs|go|rs|swift|kt|sh|bash|yml|yaml|xml|sql|env|vue|svelte|toml|ini|conf|csv)$/i;
  const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|__pycache__|__MACOSX)\//;
  const names = Object.keys(zip.files)
    .filter(n => !zip.files[n].dir && TEXT.test(n) && !SKIP.test(n))
    .slice(0, 120);
  if(!names.length) throw new Error('لا توجد ملفات نصية قابلة للقراءة داخل الأرشيف.');

  const parts = ['ملفات داخل الأرشيف "' + file.name + '" (' + names.length + ' ملف):', names.join('\n'), '', '=== المحتوى ==='];
  let used = 0, readCount = 0, truncatedFiles = 0, skippedFiles = 0;
  const MAX_TOTAL = 300000;
  // ملف واحد كبير (مثل index.html) لا يُقصّ إلى 20K — يُعطى كاملًا حتى حدّ الإجمالي.
  const MAX_PER_FILE = names.length === 1 ? MAX_TOTAL : 80000;
  for(const n of names){
    if(used >= MAX_TOTAL) { skippedFiles++; continue; }
    let txt = '';
    try{ txt = await zip.files[n].async('string'); }
    catch(e){ continue; }
    const full = txt.length;
    txt = txt.slice(0, Math.min(MAX_PER_FILE, MAX_TOTAL - used));
    if(txt.length < full) truncatedFiles++;
    parts.push('\n--- ' + n + ' ---\n' + txt);
    used += txt.length;
    readCount++;
  }
  // خلاصة صريحة بدل «قُصّ الباقي» التي توهم النموذج أن الملف انقطع/تالف.
  let note = '\n\n=== خلاصة القراءة ===\nقُرئ ' + readCount + ' من ' + names.length +
    ' ملف (' + used.toLocaleString('en-US') + ' حرف).';
  if(truncatedFiles) note += ' اختُصر ' + truncatedFiles + ' ملف كبير جدًا.';
  if(skippedFiles) note += ' لم يُقرأ ' + skippedFiles + ' ملف بعد بلوغ الحد الإجمالي.';
  parts.push(note);
  return parts.join('\n');
}

async function processArchiveAttachment(file, attachment, preReadB64){
  try{
    // v412 — المسار الأول: الفكّ في المتصفح — بلا حدّ حجم عمليًا.
    try{
      attachment.text = await unzipInBrowser(file);
      return;
    }catch(localErr){
      console.warn('[archive] local unzip failed, falling back to server:', localErr && localErr.message);
      // ملفات Office (docx/xlsx/pptx) بنيتها خاصة — الخادم يعرف كيف يقرأها.
    }
    if(file.size > MAX_ARCHIVE_DIRECT_BYTES){
      throw new Error('الملف ' + (file.size / 1048576).toFixed(1) + ' م.ب — الحد ' +
        (MAX_ARCHIVE_DIRECT_BYTES / 1048576) + ' م.ب للتحليل على الخادم. احذف مجلدات مثل node_modules وأعد الضغط.');
    }
    const fileBase64 = preReadB64 || await fileToBase64(file);
    const resp = await fetch('/api/analyze-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, filename: file.name })
    });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok || !data.ok) throw new Error(data.error || ('فشل التحليل (HTTP ' + resp.status + ')'));
    attachment.text = data.content;
  }catch(err){
    console.error('archive analyze error', err);
    attachment.error = true;
    // نعرض السبب الحقيقي — الرسالة العامة كانت تترك المستخدم بلا فكرة
    // عمّا يفعله (يصغّر الملف؟ يعيد المحاولة؟ الميزة معطّلة؟).
    attachment.text = '⚠️ ' + file.name + ': ' + (err.message || err);
  }finally{
    attachment.pending = false;
    renderAttachStrip();
  }
}

// 🛠️ أدوات إضافية: قراءة PDF داخل المتصفح (pdf.js يُحمّل عند أول استخدام فقط)
async function extractPdfText(file){
  if(!window.__pdfjs){
    const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs');
    mod.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';
    window.__pdfjs = mod;
  }
  const buf = await file.arrayBuffer();
  const pdf = await window.__pdfjs.getDocument({ data: buf }).promise;
  let out = '';
  const maxPages = Math.min(pdf.numPages, 60);
  for(let p = 1; p <= maxPages; p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    out += tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim() + '\n\n';
    if(out.length > MAX_TEXT_ATTACH_CHARS) break;
  }
  if(pdf.numPages > maxPages) out += '\n... (' + pdf.numPages + ' pages total, first ' + maxPages + ' extracted)';
  return out;
}

// 🛠️ أدوات إضافية: ملخص إحصائي فوري لملفات CSV/TSV قبل إرسالها للنموذج
function summarizeCsvText(text){
  try{
    const delim = (text.indexOf('\t') !== -1 && text.indexOf('\t') < (text.indexOf(',') === -1 ? Infinity : text.indexOf(','))) ? '\t' : ',';
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if(lines.length < 2) return '';
    const header = lines[0].split(delim).map(h => h.trim());
    const rows = lines.slice(1, 5001).map(l => l.split(delim));
    let summary = 'ROWS: ' + (lines.length - 1) + ' | COLUMNS (' + header.length + '): ' + header.join(', ') + '\n';
    header.forEach((h, ci) => {
      const vals = rows.map(r => parseFloat(r[ci])).filter(v => isFinite(v));
      if(vals.length > rows.length * 0.6 && vals.length > 0){
        const sum = vals.reduce((a, b) => a + b, 0);
        summary += '- ' + h + ': min=' + Math.min(...vals) + ', max=' + Math.max(...vals) + ', avg=' + (sum / vals.length).toFixed(2) + '\n';
      }
    });
    return summary;
  }catch(_e){ return ''; }
}

/* v-nano-pro-edit: الطلب الإبداعي القصير على صورة (أقوى/أفخم/طوّرها/فكرة ثانية/كرتون…) — يُقرأ هنا وفي أداة
   edit_image/generate_image (app-17) حتى لا يرسم النموذج صورة جديدة بلا علاقة بالمصدر. */
const __IMG_CREATIVE_RE = /(?:^|[\s،,])(?:نسخ[ةه]\s*)?(?:ال)?(?:أ|ا|إ)(?:قوى|قوي|فخم|رقى|جمل|حلى|روع|بدع|حسن|فضل|بهى)(?=$|[\s،,.!؟?])|(?:^|[\s،,])(?:فخم[ةه]?|راقي[ةه]?|خيالي[ةه]?|جبار[ةه]?|مبهر[ةه]?|إبداعي[ةه]?|ابداعي[ةه]?|احترافي[ةه]?|تجنن|لايق[ةه]?)(?=$|[\s،,.!؟?])|(?:^|[\s،,])(?:[اأ]?(?:طوّ?ر|حسّ?ن|جمّ?ل|قوّ?|رقّ?|زيّ?ن|زخرف|فخّ?م|عزّ?ز)|ارفع|ابهر|أبهر)(?:ها|ه|يها|يه|ني)(?=$|[\s،,.!؟?])|(?:^|[\s،,])(?:ارفع|إرفع)\s*(?:ال)?(?:مستوى|مستواها|جودتها|جودة)|(?:^|[\s،,])(?:زوّ?د|زيد)\s*(?:ال)?(?:زخارف|زخرف[ةه]|تفاصيل|فخام[ةه])|فكر[ةه]\s*(?:ثاني[ةه]|مختلف[ةه]|جديد[ةه]|أقوى|اقوى)|(?:^|[\s،,])(?:3d|ثلاثي|مجسم|مجسّم|كرتون|كارتون|أنيمي|انمي|بيكسار|ديزني|anime|cartoon|pixar|disney)(?=$|[\s،,.!؟?])|\bmake\s+(?:it|this|everything|the\s+(?:whole\s+|entire\s+)?(?:image|picture|photo|card|design|scene|look))\s+(?:much\s+|way\s+|a\s+lot\s+)?(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|pop|shine|stand\s*out|more\s+\w+)\b|\b(?:stronger|bolder|richer|fancier|nicer|prettier|cleaner|premium|luxurious|epic|enhanced|improved|upgraded|polished|more\s+\w+)\s+(?:version|look|take|edition)\b|^\s*(?:stronger|bolder|richer|fancier|nicer|prettier|better|premium|luxurious|epic|more\s+\w+)\s*[.!]*\s*$|\b(?:level\s*up|glow\s*up|next\s*level|better\s+than|best\s+version|reimagine|different\s+(?:idea|concept)|(?:enhance|improve|upgrade|elevate|polish)\s+(?:it|this|everything|the\s+(?:whole\s+|entire\s+)?(?:image|picture|photo|card|design|scene|look)))\b/i;
/* v-visual-assist: لقطة شاشة لواجهة (اسم الملف/لصق من الحافظة/PNG بنسبة شاشة)
   تُعلَّم _screenshot لتذهب للتحليل والإرشاد بدل مسار تعديل الصور. */
function omranLooksLikeScreenshot(file, dims, opts){
  try{
    const name = String((file && file.name) || '');
    if(/screen\s*shot|screenshot|snip|capture|لقطة|screencap/i.test(name)) return true;
    if(opts && opts.pasted) return true;
    const w = (dims && dims.width) || 0, h = (dims && dims.height) || 0;
    if(!w || !h) return false;
    const png = /png/i.test((file && file.type) || '') || /\.png$/i.test(name);
    if(!png) return false;
    const r = Math.max(w, h) / Math.min(w, h);
    return r >= 1.55 && r <= 2.45 && Math.max(w, h) >= 640;
  }catch(e){ return false; }
}
async function omranIngestFiles(files, opts){
  files = Array.from(files || []);
  opts = opts || {};
  for(const file of files){
    try{
      if(file.size > MAX_ATTACH_FILE_BYTES){
        console.error('attach file too large', file.name, file.size);
        pendingAttachments.push({ name: file.name, isImage: false, error: true, text: '⚠️ ' + file.name + ': ' + t('attachTruncated') });
        continue;
      }
      if(isImageAttachment(file)){
        /* v-heic: صور HEIC (هواوي/آيفون) كانت تمر خامًا فيرفضها التحليل —
           تُحوَّل JPEG محليًا قبل التصغير. */
        let imgFile = file;
        try{ imgFile = await omranNormalizeImageFile(file); }
        catch(e){ __swallow(e, 'attach:heic'); }
        let dataUrl, mime, __dims = null;
        try{
          const resized = await resizeImageFile(imgFile);
          dataUrl = resized.dataUrl;
          mime = resized.mime;
          __dims = resized;
        }catch(resizeErr){
          // Fall back to the original file if resizing fails for any reason
          // (e.g. unsupported image type in <canvas>), but warn if it's huge.
          console.error('image resize failed, using original', resizeErr);
          dataUrl = await readFileAsDataUrl(imgFile);
          mime = imgFile.type;
        }
        // v381: نسخة مضغوطة للمزامنة
        var serverThumb = '';
        try{ serverThumb = await makeServerThumb(dataUrl); }catch(e){ __swallow(e, "misc:app-09-attach#2"); }
        pendingAttachments.push({ name: file.name, isImage: true, mime, dataUrl, serverThumb, _screenshot: omranLooksLikeScreenshot(file, __dims, opts) });
      } else if(/\.pdf$/i.test(file.name)){
        // 📄 PDF: استخراج النص صفحة بصفحة داخل المتصفح
        const attachment = { name: file.name, isImage: false, pending: true, text: '' };
        pendingAttachments.push(attachment);
        renderAttachStrip();
        extractPdfText(file).then(txt => {
          attachment.text = txt && txt.trim() ? txt.slice(0, MAX_TEXT_ATTACH_CHARS) : '⚠️ (PDF بدون نص قابل للاستخراج — قد يكون صورًا ممسوحة)';
          attachment.pending = false;
          renderAttachStrip();
        }).catch(pdfErr => {
          console.error('pdf extract error', pdfErr);
          attachment.text = '⚠️ ' + t('attachTruncated') + ' (' + file.name + '): ' + (pdfErr.message || pdfErr);
          attachment.pending = false;
          renderAttachStrip();
        });
      } else if(ARCHIVE_EXT_RE.test(file.name)){
        // Large archive: upload to Blob storage then let the server unzip +
        // extract its text content so all providers can read it - runs in
        // the background while the user keeps composing; sendPrompt() is
        // blocked while any attachment is still `pending`.
        const attachment = { name: file.name, isImage: false, pending: true, text: '' };
        pendingAttachments.push(attachment);
        // v405: نقرأ البايتات هنا (قبل ما يُمسح input.value في نهاية المعالج)
        // — القراءة المؤجلة كانت تجد الملف منفصلًا فتفشل بـ«تعذّر قراءة الملف».
        // التحليل نفسه يبقى بالخلفية.
        let archiveB64 = null;
        try{ archiveB64 = file.size <= MAX_ARCHIVE_DIRECT_BYTES ? await fileToBase64(file) : null; }catch(e){ __swallow(e, 'attach:zipread'); }
        processArchiveAttachment(file, attachment, archiveB64);
      } else {
        let text = await readFileAsText(file);
        if(text.length > MAX_TEXT_ATTACH_CHARS){
          text = text.slice(0, MAX_TEXT_ATTACH_CHARS) + '\n... (' + t('attachTruncated') + ')';
        }
        pendingAttachments.push({ name: file.name, isImage: false, text });
      }
    }catch(err){ console.error('attach read error', err); }
  }
  renderAttachStrip();
}
$('#attachInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  await omranIngestFiles(files);
  e.target.value = '';
});
/* v-visual-assist: سحب وإفلات على صندوق المحادثة + لصق لقطة الشاشة (Ctrl+V). */
(function(){
  try{
    const box = document.getElementById('composerBox');
    if(!box) return;
    const st = document.createElement('style');
    st.textContent = '#composerBox.omranDragOver{outline:2px dashed var(--omGold,#d4af37) !important; outline-offset:2px; position:relative;}'
      + '#composerBox.omranDragOver::after{content:attr(data-drop-hint); position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:var(--omGold,#d4af37); background:rgba(0,0,0,.55); border-radius:inherit; pointer-events:none; z-index:5;}';
    document.head.appendChild(st);
    let __dragDepth = 0;
    const hasFiles = (e) => { try{ return Array.from((e.dataTransfer && e.dataTransfer.types) || []).indexOf('Files') !== -1; }catch(_){ return false; } };
    const on = () => { try{ box.setAttribute('data-drop-hint', t('attachDropHere')); }catch(_){ /* guard-ok — cleanup, intentional */ } box.classList.add('omranDragOver'); };
    const off = () => { __dragDepth = 0; box.classList.remove('omranDragOver'); };
    document.addEventListener('dragenter', (e) => { if(!hasFiles(e)) return; __dragDepth++; on(); });
    document.addEventListener('dragover', (e) => { if(!hasFiles(e)) return; e.preventDefault(); });
    document.addEventListener('dragleave', (e) => { if(!hasFiles(e)) return; __dragDepth = Math.max(0, __dragDepth - 1); if(!__dragDepth) off(); });
    document.addEventListener('drop', (e) => {
      if(!hasFiles(e)) return;
      off();
      if(e.defaultPrevented) return; // منطقة إفلات خاصة (ديكور/تصميم) أخذته
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files || []);
      if(!files.length) return;
      omranIngestFiles(files).then(() => { try{ $('#prompt').focus(); }catch(_){ /* guard-ok — cleanup, intentional */ } });
    });
    document.addEventListener('paste', (e) => {
      try{
        const ae = document.activeElement;
        if(ae && ae.id !== 'prompt' && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
        const files = items.filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
        if(!files.length) return;
        e.preventDefault();
        const named = files.map((f, i) => { try{ return new File([f], 'pasted-' + Date.now() + (i ? '-' + i : '') + '.png', { type: f.type || 'image/png' }); }catch(_){ return f; } });
        omranIngestFiles(named, { pasted: true }).then(() => { try{ $('#prompt').focus(); }catch(_){ /* guard-ok — cleanup, intentional */ } });
      }catch(err){ __swallow(err, 'attach:paste'); }
    });
  }catch(e){ __swallow(e, 'attach:dnd'); }
})();

// "المدرب" (smart router): reads the user's message and picks the 2-3
// providers best suited to it out of the eligible pool, so every message
// automatically gets routed to specialists instead of always asking all 9.
// No UI/buttons involved - this is silent, automatic, and always falls back
// to the full eligible pool on any failure so a message is never blocked.
const SMART_PROVIDER_SPECIALTIES = {
  openai: 'محادثة عامة متوازنة، كتابة، أسئلة عامة',
  gemini: 'سياق طويل جدًا، تحليل مستندات/فيديو كبيرة، أسئلة عامة',
  groq: 'إجابات سريعة جدًا وبسيطة',
  claude: 'أفضل خيار لتصميم واجهات وتصاميم كاملة، وأقوى خيار للبرمجة المعقدة والدقيقة',
};

async function pickSmartProviders(userText, eligibleKeys){
  if(!eligibleKeys || eligibleKeys.length <= 3) return eligibleKeys;
  const safePick = ['claude', 'openai'].filter(k => eligibleKeys.includes(k));
  if(safePick.length === 0) safePick.push(eligibleKeys[0]);
  try{
    const list = eligibleKeys.map(k => '- ' + k + ': ' + (SMART_PROVIDER_SPECIALTIES[k] || '')).join('\n');
    const sys = 'أنت مصنّف مهام صامت. مهمتك اختيار أنسب مزودي ذكاء اصطناعي (من القائمة أدناه) لسؤال المستخدم، حسب تخصص كل مزود وحسب حجم/تعقيد المهمة:\n- مهمة بسيطة أو صغيرة (لعبة بسيطة، صفحة واحدة قصيرة، سؤال عام، شرح سريع): اختر مزود واحد فقط، الأسرع والأنسب.\n- مهمة متوسطة: اختر مزودين.\n- مهمة معقدة فعلًا (تطبيق كامل متعدد الصفحات، تصميم متقدم يحتاج مقارنة جودة): اختر 3 كحد أقصى.\nلا تختر أكثر من مزود واحد إلا إذا كانت المهمة فعلًا تستحق ذلك. رد فقط بمصفوفة JSON من المفاتيح بدون أي شرح، مثال: ["claude"]\n\nالمزودون المتاحون:\n' + list;
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {role: 'system', content: sys},
          {role: 'user', content: String(userText || '').slice(0, 2000)}
        ],
        token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), stream: false
      })
    });
    if(!res.ok) return safePick;
    const data = await res.json();
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if(!raw) return safePick;
    const match = raw.match(/\[[\s\S]*?\]/);
    if(!match) return safePick;
    const parsed = JSON.parse(match[0]);
    const picked = parsed.filter(k => eligibleKeys.includes(k));
    if(picked.length >= 1) return picked.slice(0, 3);
    return safePick;
  }catch(smartErr){
    console.error('[smart router] classifier unavailable, using safe 2-provider fallback:', smartErr);
    return safePick;
  }
}


// ✍️ كتابة نص على الصورة محليًا (Canvas) — خط عربي سليم 100% بدل رسم Gemini المشوه
/* v-spell-quran (طلب عمران): تدقيق إملائي ذكي على كل نص يُطبع على صورة —
   الأسماء الناقصة تُصحح (عبداله→عبدالله)، والمرجع في الألفاظ الدينية رسم
   المصحف. حارس أمان: تُقبل فقط التعديلات الطفيفة (حتى حرفين بالكلمة، بلا
   إضافة أو حذف كلمات) كي لا يتبدل اسم صحيح باسم آخر. الفشل = النص كما هو. */
function __omLev(a, b){
  const m = a.length, n = b.length;
  if(!m) return n; if(!n) return m;
  let prev = Array.from({length: n + 1}, (_, j) => j);
  for(let i = 1; i <= m; i++){
    const cur = [i];
    for(let j = 1; j <= n; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function __spellGuardOk(orig, fixed){
  const a = String(orig || '').trim().split(/\s+/), b = String(fixed || '').trim().split(/\s+/);
  if(!b.length || !b[0] || a.length !== b.length) return false;
  for(let i = 0; i < a.length; i++){
    if(a[i] === b[i]) continue;
    if(__omLev(a[i], b[i]) > Math.max(2, Math.ceil(Math.max(a[i].length, b[i].length) * 0.34))) return false;
  }
  return true;
}
/* تصحيحات حتمية برسم المصحف — لا تحتاج ذكاءً ولا يحدها حارس الكلمات */
const __QURAN_FIXES = [
  [/(^|\s)انشاء\s*الله($|\s)/g, '$1إن شاء الله$2'],
  [/(^|\s)ان\s*شاء?الله($|\s)/g, '$1إن شاء الله$2'],
  [/(^|\s)انشالله($|\s)/g, '$1إن شاء الله$2'],
  [/(^|\s)ماشاء\s*الله($|\s)/g, '$1ما شاء الله$2'],
  [/(^|\s)ماشالله($|\s)/g, '$1ما شاء الله$2'],
  [/(^|\s)عبداله($|\s)/g, '$1عبدالله$2'],
  [/(^|\s)الحمدالله($|\s)/g, '$1الحمد لله$2'],
  [/(^|\s)جزاك\s*اله($|\s)/g, '$1جزاك الله$2'],
];
async function omranSpellFix(txt){
  let t = String(txt || '').trim();
  if(!t || !/[\u0600-\u06FF]/.test(t) || t.length > 300) return txt;
  for(const [re, rep] of __QURAN_FIXES) t = t.replace(re, rep);
  const sys = 'أنت مدقق إملائي عربي دقيق، مرجعك في الألفاظ والأسماء الدينية رسم المصحف الشريف. صحح الأخطاء الإملائية الواضحة فقط في النص التالي الذي سيُطبع على صورة (أسماء أشخاص، عبارات تهنئة، أدعية): الحروف الناقصة مثل «عبداله» تصير «عبدالله»، والهمزات، و«انشاء الله» تصير «إن شاء الله». لا تغيّر اسمًا يحتمل أن يكون صحيحًا كما هو، ولا تضف ولا تحذف كلمات، ولا تغيّر المعنى. أعد النص المصحح فقط بلا أي شرح ولا علامات اقتباس.';
  try{
    const fixed = await Promise.race([
      (async () => {
        for(const p of ['groq', 'mistral']){
          try{
            const r = await callProviderAI(p, [ { role: 'system', content: sys }, { role: 'user', content: t } ], () => {});
            const out = String(r || '').trim().replace(/^[«"']+|[»"']+$/g, '').trim();
            if(out) return out;
          }catch(e){ /* جرب التالي */ }
        }
        return '';
      })(),
      new Promise(res => setTimeout(() => res(''), 6000)),
    ]);
    if(fixed && fixed !== t && __spellGuardOk(t, fixed)) return fixed;
  }catch(e){ __swallow(e, 'img:spell-fix'); }
  return t; /* التصحيحات الحتمية محفوظة حتى لو تعذر الذكاء */
}
function extractOverlayText(t){
  const spec = window.__parseImageTextSpec ? window.__parseImageTextSpec(t) : null;
  return spec && spec.exactText ? spec.exactText : null;
}
// 🎨 استخراج سطور النص العربي من طلب التصميم (عنوان + اسم + مناسبة)
function extractDesignLines(t){
  t = String(t || '');
  if(!/[\u0600-\u06FF]/.test(t)) return []; // طلب بغير العربية → نترك المولد يكتب
  const lines = [];
  const mTitle = t.match(/(شهادة|شهاده|بطاقة|بطاقه|دعوة|دعوه|تهنئة|تهنئه)\s*(ترقية|ترقيه|تهنئة|تهنئه|تقدير|شكر|تخرج|زواج|نجاح|دعوة|دعوه|عيد ميلاد|ميلاد)?/);
  if(mTitle) lines.push((mTitle[1] + (mTitle[2] ? ' ' + mTitle[2] : '')).trim());
  const mName = t.match(/(?:باسم|بإسم|إلى|الي|للسيد|للسيدة|لـ)\s+(.+?)(?=\s+(?:بمناسبة|بي\s*مناسبة|بمناسبه|في|على|الي\s+وكيل)|$)/);
  if(mName){ const n = mName[1].trim().replace(/[،.]+$/, ''); if(n && n.length <= 60) lines.push(n); }
  const mOcc = t.match(/(?:بمناسبة|بي\s*مناسبة|بمناسبه)\s+(.+)$/);
  if(mOcc){ const o = ('بمناسبة ' + mOcc[1].trim()).replace(/[،.]+$/, ''); if(o.length <= 80) lines.push(o); }
  return lines.slice(0, 3);
}
// 🧠 استخراج سطور التصميم بالذكاء الاصطناعي (Groq → Mistral) مهما كانت صياغة الطلب،
// مع الرجوع للأنماط الثابتة إذا فشل الاستخراج.
async function aiExtractDesignLines(t){
  const rx = extractDesignLines(t);
  if(!/[\u0600-\u06FF]/.test(String(t || ''))) return rx;
  const sys = 'أنت مساعد يستخرج سطور النص التي ستُكتب على تصميم (شهادة/بطاقة/دعوة/بوستر...). أعد JSON فقط بهذا الشكل بالضبط: {"lines":["السطر1","السطر2"]} — من 2 إلى 4 سطور قصيرة: (1) عنوان التصميم مثل "شهادة ترقية" أو "بطاقة تهنئة"، (2) اسم الشخص إن وُجد، (3) المناسبة إن وُجدت مثل "بمناسبة ترقيته إلى وكيل أول"، (4) عبارة تهنئة قصيرة مناسبة. صحح الأخطاء الإملائية في النص المستخرج. لا تكتب أي شرح خارج الـJSON.';
  const messages = [ { role: 'system', content: sys }, { role: 'user', content: String(t) } ];
  for(const p of ['groq', 'mistral']){
    try{
      const r = await callProviderAI(p, messages, () => {});
      const m = String(r || '').match(/\{[\s\S]*\}/);
      if(m){
        const j = JSON.parse(m[0]);
        if(Array.isArray(j.lines)){
          const ls = j.lines.map(s => String(s || '').trim()).filter(s => s && s.length <= 90).slice(0, 4);
          if(ls.length >= 1) return ls;
        }
      }
    }catch(e){ /* جرّب المزود التالي */ }
  }
  return rx;
}
// 🏆 اسأل الكل للتصاميم: كل مزود يقترح صياغته لنصوص الشهادة/البطاقة ثم يُختار أطيبهم
async function competeDesignLines(t){
  const sys = 'أنت كاتب تهانٍ محترف. المطلوب: أعد JSON فقط بهذا الشكل بالضبط: {"lines":["السطر1","السطر2"]} — من 2 إلى 4 سطور قصيرة وراقية لتصميم (شهادة/بطاقة/دعوة...): (1) عنوان التصميم، (2) اسم الشخص إن وُجد، (3) المناسبة إن وُجدت، (4) عبارة تهنئة بليغة ومؤثرة. صحح الأخطاء الإملائية. لا تكتب أي شرح خارج الـJSON.';
  const messages = [ { role: 'system', content: sys }, { role: 'user', content: String(t) } ];
  const provs = ['claude', 'gemini', 'openai', 'groq'];
  const parse = (r) => {
    const m = String(r || '').match(/\{[\s\S]*\}/);
    if(!m) return null;
    try{
      const j = JSON.parse(m[0]);
      if(!Array.isArray(j.lines)) return null;
      const ls = j.lines.map(s => String(s || '').trim()).filter(s => s && s.length <= 90).slice(0, 4);
      return ls.length >= 2 ? ls : null;
    }catch(e){ return null; }
  };
  const results = await Promise.all(provs.map(p => callProviderAI(p, messages, () => {}).then(parse).catch(() => null)));
  const cands = results.filter(Boolean);
  if(!cands.length) return await aiExtractDesignLines(t);
  if(cands.length === 1) return cands[0];
  // حكم سريع يختار أبلغ صياغة
  const judgeSys = 'أنت حكم لغوي. ستصلك عدة صياغات مرقمة لنصوص تصميم. اختر الأبلغ والأجمل والأصح إملائيًا. أعد JSON فقط: {"best":الرقم} بدون أي شرح.';
  const judgeUser = 'الطلب الأصلي: ' + String(t) + '\n\n' + cands.map((c, i) => (i + 1) + ') ' + c.join(' | ')).join('\n');
  for(const p of ['groq', 'mistral']){
    try{
      const r = await callProviderAI(p, [ { role: 'system', content: judgeSys }, { role: 'user', content: judgeUser } ], () => {});
      const m = String(r || '').match(/\{[\s\S]*\}/);
      if(m){
        const n = parseInt(JSON.parse(m[0]).best, 10);
        if(n >= 1 && n <= cands.length) return cands[n - 1];
      }
    }catch(e){ /* جرّب الحكم التالي */ }
  }
  // بدون حكم: الأطول محتوى (غالبًا الأغنى صياغة)
  return cands.sort((a, b) => b.join('').length - a.join('').length)[0];
}
// 🖋️ كتابة سطور عربية سليمة في وسط التصميم (عنوان كبير + سطور أصغر)
function overlayDesignLines(b64, mime, lines){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try{
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const x = c.width / 2;
        const sizes = [Math.floor(c.width / 10), Math.floor(c.width / 16), Math.floor(c.width / 20)];
        const gap = Math.floor(c.height / 9);
        const startY = c.height / 2 - ((lines.length - 1) * gap) / 2;
        lines.forEach((txt, i) => {
          let fs = sizes[Math.min(i, sizes.length - 1)];
          const setF = () => { ctx.font = 'bold ' + fs + 'px "Segoe UI", Tahoma, Arial, sans-serif'; };
          setF();
          while(ctx.measureText(txt).width > c.width * 0.82 && fs > 14){ fs -= 2; setF(); }
          const y = startY + i * gap;
          ctx.lineWidth = Math.max(3, Math.floor(fs / 8));
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(txt, x, y);
          ctx.fillStyle = '#5a3e1b'; ctx.fillText(txt, x, y);
        });
        resolve((c.toDataURL('image/png')).split(',')[1]);
      }catch(e){ reject(e); }
    };
    img.onerror = reject;
    img.src = 'data:' + mime + ';base64,' + b64;
  });
}
const MAHA_FONTS = {
  default:{css:'Tajawal',gf:'Tajawal:wght@700'}, kufi:{css:'Reem Kufi',gf:'Reem+Kufi:wght@700'}, naskh:{css:'Amiri',gf:'Amiri:wght@700'}, naskh2:{css:'Noto Naskh Arabic',gf:'Noto+Naskh+Arabic:wght@700'}, thuluth:{css:'Aref Ruqaa',gf:'Aref+Ruqaa:wght@700'}, farsi:{css:'Gulzar',gf:'Gulzar'}, diwani:{css:'Katibeh',gf:'Katibeh'}, ruqaa:{css:'Rakkas',gf:'Rakkas'}, quran:{css:'Scheherazade New',gf:'Scheherazade+New:wght@700'}, othmani:{css:'Scheherazade New',gf:'Scheherazade+New:wght@700'}
};
async function mahaLoadFont(key){
  const f = MAHA_FONTS[key] || MAHA_FONTS.default;
  /* v-font-real (شكوى: «جربنا كل الخطوط ما في أي خط مرتب»): كان يضيف رابط
     الخط ويرسم فورًا قبل وصول الملف — fonts.load ترجع فارغة لأن قاعدة
     @font-face لم تُقرأ بعد، فيسقط الرسم على الخط العادي في كل مرة أولى.
     الآن: ننتظر تحميل ورقة الأنماط ثم نتحقق فعليًا أن الخط جاهز (حتى 3 ثوانٍ).
     الطلب بلا bold لأن الخطوط الزخرفية (Katibeh/Rakkas/Gulzar) وزنها 400 فقط. */
  if(!document.getElementById('gf-' + f.css)){
    await new Promise((res) => {
      const l = document.createElement('link');
      l.id = 'gf-' + f.css; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=' + f.gf + '&display=swap';
      l.onload = res; l.onerror = res;
      document.head.appendChild(l);
      setTimeout(res, 3000);
    });
  }
  const spec = '40px "' + f.css + '"';
  for(let i = 0; i < 20; i++){
    try{ await document.fonts.load(spec, 'عيدكم مبارك'); }catch(_){ __swallow(_, "misc:app-09-attach#3"); }
    try{ if(document.fonts.check(spec, 'عيدكم مبارك')) break; }catch(_){ break; }
    await new Promise(r => setTimeout(r, 150));
  }
  return f.css;
}
async function overlayTextOnImage(b64, mime, txt, fontKey, colorStr, position){
  const exact = String(txt == null ? '' : txt).replace(/\r\n?/g, '\n');
  if(!exact.trim()) throw new Error('missing_exact_text');
  const fontCss = await mahaLoadFont(fontKey || 'default');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try{
        /* v-gold-overlay (أمر عمران ٣٠ أغسطس — «يخرب الصورة، ابدأ من الصفر،
           أريد أفضل من GPT»): إعادة بناء الراسم كاملًا.
           1) لا شرائط ولا تمديد كانفس أبدًا — أبعاد الصورة تبقى كما هي والنص
              يُرسم عليها (شريط v676 الملوّن كان يشوّه الصورة).
           2) ذهب متدرّج حقيقي + حدّ داكن ناعم + ظل، مع وشاح تعتيم متدرّج
              خفيف خلف النص فقط ليُقرأ على أي خلفية.
           3) زخرفة فاصلة (فلوريش) تحت النص مع الخطوط المزخرفة/الذهبية —
              مثل تصاميم الخطاطين، والإملاء مضمون حرفيًا (رسم محلي لا توليد). */
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // اختيار تلقائي: أهدأ طرف (أعلى/أسفل فقط) — الأسفل مفضّل كالتصاميم الاحترافية
        if(!position || position === 'auto'){
          position = 'bottom';
          try{
            const bandSd = (fy) => {
              const zy = Math.floor(c.height * fy), zh = Math.max(1, Math.min(c.height - Math.floor(c.height * fy), Math.floor(c.height * 0.22)));
              const d = ctx.getImageData(0, zy, c.width, zh).data;
              let sum = 0, sq = 0, n = 0;
              for(let i = 0; i < d.length; i += 52){ const l = d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; sum+=l; sq+=l*l; n++; }
              const mn = sum/n; return Math.sqrt(Math.max(0, sq/n - mn*mn));
            };
            if(bandSd(0.02) + 8 < bandSd(0.76)) position = 'top';
          }catch(e){ position = 'bottom'; }
        }
        const __side=/^(right|left)-/.exec(position||'');
        const maxWidth=c.width*(__side?.[1]?0.30:0.84), maxHeight=c.height*(__side?0.44:0.24);
        if(__side){ctx.translate((__side[1]==='right'?1:-1)*c.width*.34,0);position=position.slice(__side[0].length);}
        let fs = Math.floor(Math.min(c.width / 8.5, c.height / 9));
        let lines = [];
        const setF = () => { ctx.font = '700 ' + fs + 'px "' + fontCss + '", "Segoe UI", Tahoma, Arial, sans-serif'; };
        const wrap = (line) => {
          if(!line) return [''];
          if(ctx.measureText(line).width <= maxWidth) return [line];
          const words = line.split(/\s+/), out = []; let row = '';
          words.forEach((word) => {
            const next = row ? row + ' ' + word : word;
            if(row && ctx.measureText(next).width > maxWidth){ out.push(row); row = word; }
            else row = next;
          });
          if(row) out.push(row);
          return out;
        };
        do{
          setF();
          lines = exact.split('\n').flatMap(wrap);
          if(lines.length * fs * 1.42 <= maxHeight && lines.every((line) => ctx.measureText(line).width <= maxWidth)) break;
          fs -= 2;
        }while(fs > Math.max(22, Math.floor(c.width / 68)));
        setF();
        const lineHeight = fs * 1.42, totalHeight = lines.length * lineHeight;
        const decorative = /^(diwani|thuluth|ruqaa|quran|othmani|farsi|kufi)$/.test(String(fontKey || ''));
        const goldHex = /^#(f4cf65|ffd400|f4d03f|d4af37|c9962e)$/i.test(String(colorStr || ''));
        const goldMode = goldHex || (decorative && (!colorStr || /^#ffffff$/i.test(colorStr)));
        const ornH = (decorative || goldMode) ? Math.floor(fs * 0.9) : 0;
        let firstY = c.height - c.height * 0.055 - (totalHeight + ornH) + lineHeight / 2;
        if(position === 'top') firstY = c.height * 0.07 + lineHeight / 2;
        if(position === 'center') firstY = c.height / 2 - (totalHeight + ornH) / 2 + lineHeight / 2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.direction = /[\u0600-\u06FF]/.test(exact) ? 'rtl' : 'ltr';
        const blockTop = firstY - lineHeight / 2, blockBot = firstY + (lines.length - 1) * lineHeight + lineHeight / 2;
        // وشاح قراءة متدرّج خفيف خلف منطقة النص فقط — يذوب في الصورة ولا يغطيها
        try{
          const zt = Math.max(0, blockTop - lineHeight), zb = Math.min(c.height, blockBot + ornH + lineHeight * 0.8);
          const g = ctx.createLinearGradient(0, zt, 0, zb);
          if(position === 'top'){ g.addColorStop(0,'rgba(0,0,0,.36)'); g.addColorStop(0.7,'rgba(0,0,0,.14)'); g.addColorStop(1,'rgba(0,0,0,0)'); }
          else { g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.3,'rgba(0,0,0,.14)'); g.addColorStop(1,'rgba(0,0,0,.36)'); }
          ctx.fillStyle = g;
          ctx.fillRect(__side ? -c.width : 0, zt, c.width * 3, zb - zt);
        }catch(e){ __swallow(e, 'img:overlay#scrim'); }
        // التعبئة: ذهب متدرّج للمزخرف/الذهبي، وإلا اللون المطلوب بحدّ ذكي
        const mkGold = (y1, y2) => {
          const g = ctx.createLinearGradient(0, y1, 0, y2);
          g.addColorStop(0,'#fdf3c0'); g.addColorStop(0.38,'#f3d67a'); g.addColorStop(0.62,'#d9a83f'); g.addColorStop(0.82,'#b8862b'); g.addColorStop(1,'#f0cf6f');
          return g;
        };
        let fill, strokeCol, shadowCol;
        if(goldMode){ fill = mkGold(blockTop, blockBot); strokeCol = 'rgba(70,44,8,.55)'; shadowCol = 'rgba(0,0,0,.5)'; }
        else {
          const base = colorStr || '#ffffff';
          let dark = false;
          if(/^#[0-9a-f]{6}$/i.test(base)){
            const lum = parseInt(base.slice(1,3),16)*0.299 + parseInt(base.slice(3,5),16)*0.587 + parseInt(base.slice(5,7),16)*0.114;
            dark = lum < 128;
          }
          fill = base;
          strokeCol = dark ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.7)';
          shadowCol = dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.5)';
        }
        ctx.lineJoin = 'round'; ctx.miterLimit = 2;
        ctx.lineWidth = Math.max(2, Math.floor(fs / 14));
        ctx.strokeStyle = strokeCol;
        ctx.fillStyle = fill;
        ctx.shadowColor = shadowCol;
        ctx.shadowBlur = Math.max(6, Math.floor(fs / 7));
        ctx.shadowOffsetY = Math.max(1, Math.floor(fs / 30));
        lines.forEach((line, i) => {
          const y = firstY + i * lineHeight;
          ctx.strokeText(line, c.width / 2, y, maxWidth);
          ctx.fillText(line, c.width / 2, y, maxWidth);
        });
        // 🌿 الزخرفة الفاصلة تحت النص — لفّتان متناظرتان ومعيّن مركزي
        if(ornH){
          try{
            const cx = c.width / 2, oy = blockBot + ornH * 0.55;
            const w = Math.min(maxWidth * 0.62, fs * 6.4);
            const og = goldMode ? mkGold(oy - fs * 0.3, oy + fs * 0.3) : fill;
            ctx.save();
            ctx.shadowBlur = Math.max(3, Math.floor(fs / 12));
            ctx.shadowOffsetY = 1;
            ctx.lineWidth = Math.max(2, Math.floor(fs / 18));
            ctx.strokeStyle = og;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx + fs * 0.5, oy);
            ctx.bezierCurveTo(cx + w * 0.24, oy - fs * 0.30, cx + w * 0.32, oy + fs * 0.32, cx + w * 0.5, oy - fs * 0.06);
            ctx.moveTo(cx - fs * 0.5, oy);
            ctx.bezierCurveTo(cx - w * 0.24, oy - fs * 0.30, cx - w * 0.32, oy + fs * 0.32, cx - w * 0.5, oy - fs * 0.06);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx, oy - fs * 0.17); ctx.lineTo(cx + fs * 0.17, oy); ctx.lineTo(cx, oy + fs * 0.17); ctx.lineTo(cx - fs * 0.17, oy);
            ctx.closePath();
            ctx.fillStyle = og;
            ctx.fill();
            ctx.restore();
          }catch(e){ __swallow(e, 'img:overlay#ornament'); }
        }
        resolve(c.toDataURL('image/png').split(',')[1]);
      }catch(e){ reject(e); }
    };
    img.onerror = reject;
    img.src = 'data:' + mime + ';base64,' + b64;
  });
}

/* v-edit-shrink (شكوى عمران: «بدل التاريخ بدل 28 حط 12» على دعوة مولّدة فشلت
   ٥ مرات بـ«انقطع الاتصال»): الصور المولّدة عالية الدقة تتجاوز حدّ جسم الطلب
   في فيرسل (~4.5MB) فيسقط الطلب قبل وصول الخادم أصلًا. نضغط لأقصى 1280px
   قبل الإرسال — كافية تمامًا لمولّد التعديل والنص يبقى مقروءًا. */
async function omranShrinkForEdit(b64, mime){
  try{
    if(!b64 || b64.length < 900000) return { b64: b64, mime: mime };
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => rej(new Error('bad_image'));
      i.src = 'data:' + (mime || 'image/png') + ';base64,' + b64;
    });
    const mx = 1280, sc = Math.min(1, mx / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    if(sc >= 1 && b64.length < 1600000) return { b64: b64, mime: mime };
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || mx) * sc));
    c.height = Math.max(1, Math.round((img.naturalHeight || mx) * sc));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL('image/jpeg', 0.88).split(',')[1], mime: 'image/jpeg' };
  }catch(e){ return { b64: b64, mime: mime }; }
}

/* 🔤 v-text-swap (فكرة عمران): «بدل التاريخ بدل 28 حط 12» — الرؤية تقرأ الصورة
   وتحدد سطر النص وموضعه ولونه، ونبدله هنا محليًّا: نطمس السطر القديم بلون
   الخلفية المأخوذ من الصورة نفسها ونكتب الجديد مكانه — باقي الصورة لا يُمسّ. */
function __textSwapIntent(s){
  s = String(s || '');
  if(/(?:^|[\s،,])(?:بدل|بدّل|غير|غيّر|صحح|صحّح|عدل|عدّل|شيل|احذف|امسح|استبدل)\s*(?:ال)?(?:تاريخ|اسم|رقم|حرف|رمز|كلم[ةه]|نص|سن[ةه]|وقت|عنوان|توقيت)/i.test(s)) return true;
  if(/بدل\s+\S+(?:\s+\S+)?\s+(?:حط|خل|الى|إلى)\s*\S+/i.test(s)) return true;
  return false;
}
async function omranBuildTextEditMask(b64, mime, box){
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('bad_source_image'));
    i.src = 'data:' + (mime || 'image/png') + ';base64,' + b64;
  });
  const W = img.naturalWidth || 1, H = img.naturalHeight || 1;
  const source = document.createElement('canvas'); source.width = W; source.height = H;
  source.getContext('2d').drawImage(img, 0, 0, W, H);
  const padX = Math.max(5, Math.round(box.w * W * 0.18));
  const padY = Math.max(5, Math.round(box.h * H * 0.35));
  const region = {
    x: Math.max(0, Math.round(box.x * W) - padX),
    y: Math.max(0, Math.round(box.y * H) - padY),
    w: 0, h: 0
  };
  region.w = Math.min(W - region.x, Math.round(box.w * W) + padX * 2);
  region.h = Math.min(H - region.y, Math.round(box.h * H) + padY * 2);
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
  const mx = mask.getContext('2d');
  mx.fillStyle = '#ffffff'; mx.fillRect(0, 0, W, H);
  mx.clearRect(region.x, region.y, region.w, region.h);
  return {
    sourceB64: source.toDataURL('image/png').split(',')[1],
    maskB64: mask.toDataURL('image/png').split(',')[1],
    region: region
  };
}
async function omranMergeTextEditRegion(originalB64, originalMime, editedB64, editedMime, region){
  const load = (b64, mime) => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('bad_edit_image'));
    i.src = 'data:' + (mime || 'image/png') + ';base64,' + b64;
  });
  const images = await Promise.all([load(originalB64, originalMime), load(editedB64, editedMime)]);
  const W = images[0].naturalWidth || 1, H = images[0].naturalHeight || 1;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(images[0], 0, 0, W, H);
  x.save();
  x.beginPath(); x.rect(region.x, region.y, region.w, region.h); x.clip();
  x.drawImage(images[1], 0, 0, W, H);
  x.restore();
  return c.toDataURL('image/png').split(',')[1];
}
async function omranSwapTextOnImage(b64, mime, spec){
  const fontCss = await mahaLoadFont(spec.fontKey || 'naskh');
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('bad_source_image'));
    i.src = 'data:' + mime + ';base64,' + b64;
  });
  const W = img.naturalWidth || 1, H = img.naturalHeight || 1;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const padX = Math.round(spec.box.w * W * 0.08) + 4, padY = Math.round(spec.box.h * H * 0.22) + 3;
  const bx = Math.max(0, Math.round(spec.box.x * W) - padX);
  const by = Math.max(0, Math.round(spec.box.y * H) - padY);
  const bw = Math.min(W - bx, Math.round(spec.box.w * W) + padX * 2);
  const bh = Math.min(H - by, Math.round(spec.box.h * H) + padY * 2);
  /* لون الطمس من الصورة نفسها: متوسط شريطين فوق الصندوق وتحته — أدقّ من تخمين النموذج */
  function stripAvg(sy, sh){
    try{
      const d = x.getImageData(bx, Math.max(0, sy), bw, Math.max(1, sh)).data;
      let r = 0, g = 0, bl = 0, n = 0;
      for(let i2 = 0; i2 < d.length; i2 += 4){ r += d[i2]; g += d[i2 + 1]; bl += d[i2 + 2]; n++; }
      return n ? [r / n, g / n, bl / n] : null;
    }catch(e){ return null; }
  }
  const top = stripAvg(by - 6, 5) || stripAvg(by, 3);
  const bot = stripAvg(by + bh + 1, 5) || stripAvg(by + bh - 3, 3);
  const avg = top && bot ? [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2] : (top || bot || [245, 243, 240]);
  const rgb = (v) => 'rgb(' + Math.round(v[0]) + ',' + Math.round(v[1]) + ',' + Math.round(v[2]) + ')';
  if(top && bot){
    const g2 = x.createLinearGradient(0, by, 0, by + bh);
    g2.addColorStop(0, rgb(top)); g2.addColorStop(1, rgb(bot));
    x.fillStyle = g2;
  }else{ x.fillStyle = rgb(avg); }
  x.fillRect(bx, by, bw, bh);
  /* النص الجديد: نفس الموضع، مقاس يملأ الصندوق الأصلي دون أن يفيض */
  const line = String(spec.newLine || '').trim();
  let fs = Math.max(10, Math.round(spec.box.h * H * 0.92));
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.direction = /[؀-ۿ]/.test(line) ? 'rtl' : 'ltr';
  const weight = spec.bold ? '700 ' : '';
  for(let t2 = 0; t2 < 40; t2++){
    x.font = weight + fs + 'px "' + fontCss + '", sans-serif';
    if(x.measureText(line).width <= spec.box.w * W * 1.04 || fs <= 10) break;
    fs -= Math.max(1, Math.round(fs * 0.06));
  }
  x.fillStyle = spec.color || '#333333';
  x.fillText(line, Math.round(spec.box.x * W + (spec.box.w * W) / 2), Math.round(spec.box.y * H + (spec.box.h * H) / 2));
  return c.toDataURL('image/png').split(',')[1];
}

// 🪪 v-tidy-card: «اكتب نفس المكتوب بس بخط مرتب» — نموذج مصوّر (بطاقة طالب/استمارة)
// يُقرأ عبر /api/tools?action=card-extract ثم يُعاد رسمه هنا محليًّا على كانفس:
// النص لا يمرّ على مولّد صور أبدًا فلا يتشوّه حرف، والصورة الشخصية والرسومات
// تُقتصّ من صورة المستخدم نفسها وتُعاد بإطار مرتب.
function __cardTidyIntent(s){
  s = String(s || '');
  if(/نفس\s*(?:الي|اللي|إلي|إللي|ما\s*هو|ما)?\s*(?:هو\s*)?(?:ال)?مكتوب/i.test(s)
     && /(مرتب|رتب|نظم|منظم|أنظف|انظف|أجمل|اجمل|أحسن|احسن|أنيق|انيق|أفضل|افضل|عدل|عدّل|حسّن|حسن)/i.test(s)) return true;
  if(/(?:^|[\s،,])(?:رتب|رتبي|رتبها|رتبيها|نظم|نظمي|نظمها)\s*(?:لي\s*)?(?:هال|هذي\s*|هذه\s*)?(?:ال)?(?:صور[ةه]|بطاق[ةه]|نموذج|استمار[ةه]|شهاد[ةه]|ورق[ةه]|كرت|بيانات|معلومات)/i.test(s)) return true;
  if(/(بطاق[ةه]|نموذج|استمار[ةه]|كرت)/i.test(s)
     && /(بخط\s*مرتب|مرتب[ةه]?|أنظف|انظف|أجمل|اجمل|أنيق|انيق|من\s*جديد|أعد|اعد|نفس)/i.test(s)) return true;
  return false;
}
function __cardRoundRect(x, px, py, pw, ph, r){
  const rr = Math.min(r, pw / 2, ph / 2);
  x.beginPath();
  x.moveTo(px + rr, py);
  x.arcTo(px + pw, py, px + pw, py + ph, rr);
  x.arcTo(px + pw, py + ph, px, py + ph, rr);
  x.arcTo(px, py + ph, px, py, rr);
  x.arcTo(px, py, px + pw, py, rr);
  x.closePath();
}
async function renderTidyCardCanvas(spec, srcDataUrl){
  await mahaLoadFont('default'); /* Tajawal — الخط المرتب */
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error('bad_source_image'));
    i.src = srcDataUrl;
  });
  const W = 1600, H = 1048;
  const THEMES = {
    pink:   { main:'#e91e63', soft:'#f8a5c2', line:'#fde3ee', wash:'#fff7fa' },
    blue:   { main:'#1565c0', soft:'#90caf9', line:'#e3f0fd', wash:'#f7fbff' },
    green:  { main:'#2e7d32', soft:'#a5d6a7', line:'#e6f4e7', wash:'#f8fdf8' },
    purple: { main:'#7b1fa2', soft:'#ce93d8', line:'#f3e6f7', wash:'#fdf9ff' },
    gold:   { main:'#b8862b', soft:'#e6c675', line:'#f7ecd4', wash:'#fffdf6' },
    neutral:{ main:'#37474f', soft:'#b0bec5', line:'#eceff1', wash:'#fafbfc' }
  };
  const th = THEMES[spec.theme] || THEMES.neutral;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, th.wash);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  __cardRoundRect(x, 20, 20, W - 40, H - 40, 42);
  x.lineWidth = 8; x.strokeStyle = th.soft; x.stroke();
  x.save(); x.setLineDash([10, 12]);
  __cardRoundRect(x, 42, 42, W - 84, H - 84, 30);
  x.lineWidth = 3; x.strokeStyle = th.line; x.stroke();
  x.restore();
  const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
  const crop = (b) => ({ sx: b.x * iw, sy: b.y * ih, sw: Math.max(1, b.w * iw), sh: Math.max(1, b.h * ih) });
  let hasPhoto = false;
  if(spec.photoBox){
    hasPhoto = true;
    const b = crop(spec.photoBox);
    const pw = 380, ph = Math.max(320, Math.min(520, Math.round(pw * b.sh / b.sw)));
    const px = W - 84 - pw, py = 68;
    x.save(); __cardRoundRect(x, px, py, pw, ph, 28); x.clip();
    x.fillStyle = '#fff'; x.fillRect(px, py, pw, ph);
    x.drawImage(img, b.sx, b.sy, b.sw, b.sh, px, py, pw, ph);
    x.restore();
    __cardRoundRect(x, px, py, pw, ph, 28);
    x.lineWidth = 8; x.strokeStyle = th.soft; x.stroke();
  }
  const decors = Array.isArray(spec.decorBoxes) ? spec.decorBoxes : [];
  let hasTopDecor = false;
  decors.slice(0, 2).forEach((d, i) => {
    const b = crop(d);
    const maxW = 290, maxH = 320;
    const sc = Math.min(maxW / b.sw, maxH / b.sh);
    const dw = Math.round(b.sw * sc), dh = Math.round(b.sh * sc);
    let dx, dy;
    if(i === 0){ dx = 78; dy = 60; hasTopDecor = true; }
    else { dx = hasPhoto ? 90 : (W - 84 - dw); dy = H - 44 - dh; }
    x.drawImage(img, b.sx, b.sy, b.sw, b.sh, dx, dy, dw, dh);
  });
  const LL = hasTopDecor ? 400 : 130;
  const RR = hasPhoto ? W - 510 : W - 140;
  x.direction = 'rtl';
  let y0 = 120;
  if(spec.title){
    x.fillStyle = th.main; x.textAlign = 'center';
    x.font = '700 54px "Tajawal", sans-serif';
    x.fillText(String(spec.title), Math.round((LL + RR) / 2), 140);
    y0 = 210;
  }
  const rows = (spec.rows || []).slice(0, 12);
  if(rows.length){
    const rh = Math.max(56, Math.min(100, Math.floor((H - y0 - 90) / rows.length)));
    const fs = rows.length > 8 ? 34 : 42;
    rows.forEach((r, i) => {
      const yy = y0 + i * rh + Math.round(rh / 2) + Math.round(fs * 0.35);
      const label = String(r.label || '').trim(), value = String(r.value || '').trim();
      x.textAlign = 'right';
      let vx = RR;
      if(label){
        x.fillStyle = th.main; x.font = '700 ' + fs + 'px "Tajawal", sans-serif';
        /* تسمية لاتينية (Name) تُرسم LTR وإلا انقلبت النقطتان لبدايتها */
        const lLtr = /^[\x20-\x7e]+$/.test(label);
        const ltxt = lLtr ? (label.replace(/\s*[:：]\s*$/, '') + ':') : (label.replace(/\s*[:：]\s*$/, '') + ' :');
        if(lLtr){ x.direction = 'ltr'; }
        x.fillText(ltxt, RR, yy);
        if(lLtr){ x.direction = 'rtl'; }
        vx = RR - x.measureText(ltxt).width - 22;
      }
      if(value){
        x.fillStyle = '#33303a'; x.font = '700 ' + Math.round(fs * 0.95) + 'px "Tajawal", sans-serif';
        /* أرقام/لاتيني صِرف تُرسم LTR حتى لا تنقلب خانات الهاتف */
        const ltr = /^[\x20-\x7e]+$/.test(value);
        if(ltr){ x.direction = 'ltr'; }
        x.fillText(value, vx, yy);
        if(ltr){ x.direction = 'rtl'; }
      }
      if(i < rows.length - 1){
        x.strokeStyle = th.line; x.lineWidth = 2;
        x.beginPath();
        x.moveTo(LL, y0 + (i + 1) * rh);
        x.lineTo(RR, y0 + (i + 1) * rh);
        x.stroke();
      }
    });
  }
  return c.toDataURL('image/png').split(',')[1];
}

// 🤖 وكيل عمران — عميل الواجهة: يرسل المحادثة لنقطة /api/ai?action=agent ويستقبل
// بث SSE (حالات + نص). أي كود html يُستخرج للوحة الكود والمعاينة تلقائيًا.
window.__agentModeOn = false; // v321: الوكيل دائمًا مطفي عند الفتح — لا يُحفظ تشغيله أبدًا
try{ localStorage.removeItem('aiapp_agent_mode'); }catch(e){ __swallow(e, "misc:app-09-attach#4"); }
function updateAgentModeUI(){
  const btn = document.getElementById('btnAgentMode');
  const lbl = document.getElementById('agentModeLabel');
  if(!btn || !lbl) return;
  const on = !!window.__agentModeOn;
  lbl.textContent = lang === 'ar' ? ('وكيل عمران: ' + (on ? 'شغال ✅' : 'إيقاف')) : ('Omran Agent: ' + (on ? 'ON ✅' : 'OFF'));
  btn.style.color = on ? 'var(--accent, var(--accent))' : '';
}
function __stripCodeForHistory(role, s){
  s = String(s || '');
  if(role !== 'assistant') return s;
  return s.replace(/```[\s\S]*?```/g, '[تم بناء/تعديل الكود بنجاح — الكود الكامل محفوظ في المشروع]').slice(0, 3000); // ✅ v325
}
// 🕯️ الدوام: انقطاع البث لا يعني ضياع العمل — الخادم يكمل ويكتب دفتره كل خطوة.
// نسأل الدفتر حتى ينتهي التشغيل ونستعيد نصّه، بدل رمي خطأ شبكة في وجه المستخدم.
async function __agentRecoverRun(onWait){
  const deadline = Date.now() + 150000;
  while(Date.now() < deadline){
    await new Promise(r => setTimeout(r, 3000));
    let run = null;
    try{
      const r = await fetch('/api/ai?action=agent', { method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ runState: true, token: authGet('aiapp_auth_token') }) });
      if(r.ok) run = (await r.json()).run;
    }catch(e){ continue; } // الشبكة ما زالت مقطوعة — نعيد السؤال
    if(!run) return '';    // ضيف أو دفتر انتهى عمره → لا استعادة ممكنة
    if(run.status !== 'running') return String(run.text || '');
    if(onWait) onWait(run.step || 0);
  }
  return '';
}
// 🪞 الأثر المرئي: ما فعله الوكيل فعلًا، مقروءًا من دفتره لا من كلامه. مَن غاب
// عن الشاشة ثم عاد كان يجد ناتجًا بلا سياق — الآن يجد الخطّة والخطوات.
function __agentTrailText(run){
  let out = '';
  try{
    if(run && run.plan) out += '\n\n🗺️ ' + String(run.plan).slice(0, 160);
    const tr = (run && Array.isArray(run.trail)) ? run.trail : [];
    if(tr.length){
      out += '\n' + (lang === 'ar' ? 'ما جرى فعلًا:' : 'What actually happened:');
      tr.slice(-8).forEach(function(s){
        out += '\n• ' + String((s && s.did) || '').slice(0, 90) + ' — ' + String((s && s.got) || '').slice(0, 80);
      });
    }
  }catch(e){ /* الأثر ترفٌ لا يُسقط ناتجًا */ }
  return out;
}
// 🕯️ الدوام٢: إعادة تحميل الصفحة كانت تقطع الخيط. الخادم يكمل ويكتب دفتره،
// لكن لا أحد يسأل عنه عند الفتح — فعملٌ اكتمل فعلًا كان يُرمى. هنا نسأل مرة
// واحدة: إن نجا تشغيل هذا المشروع، نعيده إلى مكانه.
async function __agentResumeOnLoad(){
  let mark = null;
  try{ mark = JSON.parse(localStorage.getItem('aiapp_agent_live') || 'null'); }catch(e){ mark = null; }
  const drop = () => { try{ localStorage.removeItem('aiapp_agent_live'); }catch(e){ window.__swallow && window.__swallow(e,'agentLive.clear'); } };
  if(!mark || !mark.p) return;                                        // لا تشغيل كان قائمًا
  if(Date.now() - (mark.t || 0) > 3540000){ drop(); return; }          // انتهى عمر الدفتر (ساعة)
  if(!window.authGet || !window.authGet('aiapp_auth_token')) return;   // جلسة غائبة → لا دفتر يُقرأ، ولا نمحو العلامة
  const cur = (state.projects || []).find(p => p.id === mark.p);
  if(!cur){ drop(); return; }                                         // المشروع حُذف بين الجلستين
  let run = null;
  try{
    const r = await fetch('/api/ai?action=agent', { method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ runState: true, token: window.authGet('aiapp_auth_token') }) });
    if(r.ok) run = (await r.json()).run;
  }catch(e){ return; }                                                // شبكة ساقطة → نحاول في فتحة قادمة
  // دفتر لمشروع آخر أو لتشغيل أقدم من علامتنا = ليس عملنا. لا نلصقه بمكان لا يخصّه.
  if(!run || run.projId !== mark.p || (run.startedAt || 0) < (mark.t || 0) - 5000){ drop(); return; }
  state.currentId = cur.id;
  const note = { role:'assistant', content: '🕯️ ' + (lang === 'ar' ? 'وكيل عمران كان يعمل قبل إعادة التحميل — أتحقّق من عمله…' : 'Omran Agent was working before the reload — checking on its work…'), _loading: true };
  cur.messages.push(note);
  renderAll();
  let text = String(run.text || ''), finished = (run.status !== 'running');
  if(!finished){
    const later = await __agentRecoverRun(function(n){
      note.content = '🔌 ' + (lang === 'ar' ? ('الوكيل يكمل على الخادم (خطوة ' + n + ')…') : ('Agent still working on the server (step ' + n + ')…'));
      renderMessages(true);
    });
    if(later){ finished = true; if(later.length > text.length) text = later; }
  }
  const i = cur.messages.indexOf(note);
  if(i >= 0) cur.messages.splice(i, 1);                               // الفقاعة المؤقتة لا تُحفظ أبدًا
  if(finished && text){
    await __agentApplyResult(cur, text);
    const last = cur.messages[cur.messages.length - 1];
    if(last) last.content = '🕯️ ' + (lang === 'ar' ? 'اكتمل على الخادم بعد إعادة التحميل.' : 'Completed on the server after the reload.') + __agentTrailText(run) + '\n' + last.content;
    drop();
  } else if(!finished){
    // ما زال يعمل بعد ١٥٠ ثانية: نُبقي العلامة — الفتحة القادمة تسأل من جديد.
    cur.messages.push({ role:'assistant', content: '🕯️ ' + (lang === 'ar' ? 'الوكيل ما زال يعمل على الخادم — أعد تحميل الصفحة بعد قليل ليظهر عمله.' : 'The agent is still working on the server — reload in a moment to see its work.') });
  } else {
    cur.messages.push({ role:'assistant', content: '🕯️ ' + (lang === 'ar' ? ('التشغيل السابق لم يكمل — الحالة: ' + (run.status || 'غير معروفة') + '. اكتب طلبك من جديد.') : ('The previous run did not finish — status: ' + (run.status || 'unknown') + '. Please ask again.')) });
    drop();
  }
  saveState();
  renderAll();
}
async function runOmranAgent(cur, apiText, thinkingDiv){
  const agentStatus = makeChatStatus(thinkingDiv);
  window.__chatStatus = agentStatus;
  let __agentStep = agentStatus.step('🤖', lang === 'ar' ? 'وكيل عمران يخطط…' : 'Omran Agent planning…');
  const history = cur.messages.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: __stripCodeForHistory(m.role, m.apiText || m.content) }));
  // العلامة تُكتب قبل الطلب لا بعده: لو أُعيد التحميل في الثانية الأولى وجب أن
  // نعرف أن هناك دفترًا يُنتظر. localStorage لأنها تنجو من إغلاق التبويب وتُكتب
  // فورًا — IndexedDB غير متزامنة فقد لا تصل قبل موت الصفحة. والضيف بلا دفتر.
  try{ if(authGet('aiapp_auth_token')) localStorage.setItem('aiapp_agent_live', JSON.stringify({ p: cur.id, t: Date.now() })); }catch(e){ __swallow(e, 'misc:agentlive'); }
  const res = await fetch('/api/ai?action=agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: genAbortController ? genAbortController.signal : undefined,
    body: JSON.stringify({ messages: history, token: authGet('aiapp_auth_token'), guestId: window.getGuestId(), currentCode: cur.code || '', projId: cur.id }),
  });
  if(!res.ok){
    try{ localStorage.removeItem('aiapp_agent_live'); }catch(e){ /* لم يبدأ تشغيل */ }
    const errText = await res.text();
    throwProviderError(res.status, errText);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', serverErr = null, streamBroke = null;
  while(true){
    let done, value;
    try{ ({ done, value } = await reader.read()); }
    catch(e){ if(e && e.name === 'AbortError'){ try{ localStorage.removeItem('aiapp_agent_live'); }catch(_){ window.__swallow && window.__swallow(_,'agentLive.clear'); } if(full) break; throw e; } streamBroke = e; break; } // انقطاع لا إلغاء → نستعيد من الدفتر
    if(done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for(const line of lines){
      if(!line.startsWith('data: ')) continue;
      let ev; try{ ev = JSON.parse(line.slice(6)); }catch(e){ continue; }
      if(ev.status){
        // Each server step closes the previous one and opens its own line, so
        // the whole trail stays visible instead of being overwritten.
        if(__agentStep) __agentStep.done();
        const __phaseIcon = {planning:'🗺️',executing:'⚙️',verifying:'🧪',reporting:'💬'}[ev.phase] || '•';
        /* v656 — نترجم الحالة بمفتاحها قبل العرض */
        const __st = (typeof tStatus === 'function') ? tStatus(ev) : ev.status;
        __agentStep = agentStatus.step(__phaseIcon, String(__st).replace(/^[^\p{L}\p{N}]+/u, '').trim() || __st);
      }
      if(ev.clientTool && window.omranAgentTools){
        // v411: الوكيل طلب تشغيل كود. ننفّذه في إطار معزول هنا ونعيد الناتج عبر
        // نقطة منفصلة — البث في اتجاه واحد فلا يمكن الرد عليه مباشرة.
        (async function(ct){
          var out;
          try{ out = await window.omranAgentTools.run(ct.name, ct.input); }
          catch(err){ out = 'تعذّر التنفيذ: ' + (err && err.message || err); }
          try{
            await fetch('/api/agent-tool-result', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: ct.id, output: out }),
            });
          }catch(err){ __swallow(err, 'misc:agenttool'); }
        })(ev.clientTool);
      }
      if(ev.delta){
        if(__agentStep){ __agentStep.done(); __agentStep = null; }
        agentStatus.release();
        full += ev.delta;
        const clean = stripCodeFromChat(full).trim();
        thinkingDiv.textContent = clean ? ('🤖 ' + clean.slice(-400)) : ('🤖 ' + (lang === 'ar' ? 'الوكيل يكتب الكود…' : 'Agent writing code…'));
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      if(ev.error) serverErr = ev.error;
    }
  }
  if(streamBroke){
    const saved = await __agentRecoverRun(function(n){
      thinkingDiv.textContent = '🔌 ' + (lang === 'ar' ? ('انقطع الاتصال — الوكيل يكمل على الخادم (خطوة ' + n + ')…') : ('Connection lost — agent still working on the server (step ' + n + ')…'));
    });
    if(saved.length > full.length) full = saved;
    if(!full) throw streamBroke;
  }
  if(serverErr && !full) throw new Error(serverErr);
  await __agentApplyResult(cur, full);
  try{ localStorage.removeItem('aiapp_agent_live'); }catch(e){ /* العلامة ترفٌ */ }
}
// 🕯️ الدوام٢: تركيب ناتج الوكيل في المشروع (كود + رسالة + إصلاح ذاتي). كان
// محبوسًا في ذيل runOmranAgent، فمسارُ الاستئناف لم يملك طريقًا لتطبيق عملٍ
// اكتمل على الخادم. استُخرج كما هو — بلا تغيير سلوك — ليخدم المسارين.
async function __agentApplyResult(cur, full){
  const parsed = extractReply(full);
  let chatText;
  let codeProducedThisTurn = false;
  if(parsed && parsed.code){
    cur.code = parsed.code;
    cur.codeType = parsed.codeType || 'html';
    codeProducedThisTurn = true;
    chatText = stripCodeFromChat(full).trim();
  } else {
    // 🛟 كود ناقص/غير مغلق (```html بلا إغلاق أو <!DOCTYPE بلا نهاية) → نلتقطه للوحة الكود بدل ما يطيح في الشات
    const fenceIdx = full.search(/```(?:html|HTML)?\s*\n/);
    const docIdx = full.search(/<!DOCTYPE|<html/i);
    const idx = fenceIdx >= 0 ? fenceIdx : docIdx;
    if(idx >= 0 && (full.length - idx) > 300){
      let codePart = full.slice(idx).replace(/^```(?:html|HTML)?\s*\n/, '').replace(/```\s*$/, '').trim();
      cur.code = codePart;
      cur.codeType = 'html';
      codeProducedThisTurn = true;
      chatText = full.slice(0, idx).replace(/```\s*$/, '').trim();
      if(chatText) chatText += '\n\n' + (lang === 'ar' ? '⚠️ يبدو أن الكود انقطع قبل اكتماله — اكتب "كمل الكود" وسأكمله.' : '⚠️ The code seems truncated — type "continue" and I will finish it.');
    } else {
      chatText = stripCodeFromChat(full).trim();
      // ⚠️ v490: مسار الوكيل كان صامتًا — كود مُلغى/محذوف ⇒ رسالة صريحة بدل معاينة فارغة.
      if(/```|<\/[a-z]+>|<!doctype|<html[\s>]/i.test(full || '')){
        chatText = (chatText ? chatText + '\n\n' : '') + t('buildNoCode');
      }
    }
  }
  if(!chatText) chatText = codeProducedThisTurn
    ? (lang === 'ar' ? 'تم بناء التطبيق ✅ افتح المعاينة وجرّبه — وإذا شي ما اشتغل اكتب لي: "صلح المشكلة".' : 'App built ✅ Open the preview and try it — if something is broken, tell me: "fix it".')
    : (lang === 'ar' ? 'تم ✅' : 'Done ✅');
  const agentMsg = { role: 'assistant', content: '🤖 ' + chatText };
  if(codeProducedThisTurn && cur.code){
    // 🛠️ إصلاح ذاتي: يفحص كود الوكيل في iframe مخفي ويصلح أخطاء التشغيل تلقائيًا
    try{
      const healed = await selfHealCode(cur.code, cur.codeType || 'html');
      if(healed && healed !== cur.code){
        cur.code = healed;
        agentMsg.content += '\n🛠️ ' + (lang === 'ar' ? 'تم فحص الكود وإصلاح أخطاء تلقائيًا.' : 'Code was tested and errors were auto-fixed.');
      }
    }catch(e){ __swallow(e, "misc:app-09-attach#5"); }
    agentMsg.code = cur.code;
    agentMsg.codeType = cur.codeType || 'html';
    agentMsg.providerLabel = '🤖 ' + (lang === 'ar' ? 'وكيل عمران' : 'Omran Agent');
  }
  cur.messages.push(agentMsg);
}

/* ✨ v-sharpen (طلب المالك: تحسين جودة/حدّة الصور بلا تكلفة): قناع حدّة خفيف
   (Unsharp Mask) على ناتج التوليد/التعديل — يجعل الصورة أوضح وأحدّ بلا تكبير
   مبهّت وبلا أي نداء مدفوع. آمن: يسقط للأصل عند أي خطأ، ويتخطّى الصور الضخمة
   حفاظًا على أداء الجوال. */
async function omranSharpenImage(dataUrl, amount){
  try{
    if(!dataUrl || String(dataUrl).slice(0, 5) !== 'data:') return dataUrl;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if(!w || !h || (w * h) > 5000000) return dataUrl; // نتخطّى الضخم (>5MP) على الجوال
    const base = document.createElement('canvas'); base.width = w; base.height = h;
    const bctx = base.getContext('2d'); if(!bctx) return dataUrl;
    bctx.drawImage(img, 0, 0);
    const blur = document.createElement('canvas'); blur.width = w; blur.height = h;
    const blctx = blur.getContext('2d'); if(!blctx) return dataUrl;
    blctx.filter = 'blur(1.1px)'; blctx.drawImage(img, 0, 0); blctx.filter = 'none';
    const bd = bctx.getImageData(0, 0, w, h), bl = blctx.getImageData(0, 0, w, h);
    const a = (typeof amount === 'number') ? amount : 0.5; // خفيف كي لا تظهر هالات
    const D = bd.data, L = bl.data;
    for(let i = 0; i < D.length; i += 4){
      for(let k = 0; k < 3; k++){ const v = D[i + k] + a * (D[i + k] - L[i + k]); D[i + k] = v < 0 ? 0 : (v > 255 ? 255 : v); }
    }
    bctx.putImageData(bd, 0, 0);
    return base.toDataURL('image/png');
  }catch(e){ __swallow(e, 'img:sharpen'); return dataUrl; }
}

async function omModeGenerateImage(cur, promptText, thinkingDiv){
  const textSpec = window.__parseImageTextSpec ? window.__parseImageTextSpec(promptText) : { wantsText:false, exactText:null, visualPrompt:promptText };
  const __m = { role: 'assistant', content: lang === 'ar' ? '🎨 أرسم لك الصورة…' : '🎨 Generating your image…', _loading: true };
  cur.messages.push(__m); renderAll();
  if(textSpec.wantsText && !textSpec.exactText && !textSpec.autoAuthored){
    __m._loading = false;
    __m.content = lang === 'ar' ? 'أرسل النص نفسه الذي تريده على الصورة، وسأكتبه حرفيًا بلا تغيير.' : 'Send the exact wording you want on the image, and I will reproduce it verbatim.';
    renderAll(); saveState();
    try{ thinkingDiv && thinkingDiv.remove(); }catch(e){ /* guard-ok — cleanup, intentional */ }
    return;
  }
  try{
    const __r = await fetch('/api/maha-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: genAbortController ? genAbortController.signal : undefined,
      body: JSON.stringify({ prompt: String(textSpec.visualPrompt || promptText).slice(0,1200), reserveTextArea: !!textSpec.wantsText, textPosition: textSpec.position, prayerRequest: textSpec.autoAuthored ? String(textSpec.prayerRequest || promptText).slice(0,800) : undefined, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() })
    });
    const __d = await __r.json().catch(() => ({}));
    __m._loading = false;
    if(__r.ok && __d && __d.imageBase64){
      let __mime = __d.mimeType || 'image/png', __b64 = __d.imageBase64;
      const __overlayText = textSpec.exactText || (textSpec.autoAuthored && typeof __d.authoredText === 'string' ? __d.authoredText.trim() : '');
      if(textSpec.wantsText && !__overlayText) throw new Error('missing_authored_prayer');
      if(__overlayText){
        __b64 = await overlayTextOnImage(__b64, __mime, __overlayText, textSpec.fontKey, textSpec.color, textSpec.position);
        __mime = 'image/png';
      }
      __m.content = (typeof __d.caption === 'string' && __d.caption) ? __d.caption : (lang === 'ar' ? 'تفضّل 👇' : 'Here you go 👇');
      let __genUrl = 'data:' + __mime + ';base64,' + __b64;
      try{ __genUrl = await omranSharpenImage(__genUrl); }catch(e){ __swallow(e, 'img:sharpen-gen'); }
      __m.attachments = [{ isImage: true, mime: (__genUrl.slice(5).split(';')[0] || __mime), dataUrl: __genUrl, name: 'image.png' }];
      try{ cur.lastEditedImage = { b64: __b64, mime: __mime }; cur.lastMsgWasImageEdit = true; }catch(e){ /* guard-ok — cleanup, intentional */ }
      // 🔄 نحفظ طلب التوليد ليعيده زر «نسخة ثانية» بتنويعة جديدة
      try{ window.__omranLastImageReq = { kind:'gen', promptText: promptText }; }catch(e){ __swallow(e, 'img:save-req-gen'); }
    } else {
      __m.content = lang === 'ar' ? ('تعذّر توليد الصورة الآن — ' + ((__d && __d.error) || ('HTTP ' + __r.status))) : ('Image generation failed — ' + ((__d && __d.error) || ('HTTP ' + __r.status)));
    }
  }catch(e){
    __m._loading = false;
    __m.content = (e && e.name === 'AbortError') ? (window.__omranTimedOut ? (lang === 'ar' ? '⚠️ انقطع الاتصال قبل وصول الصورة — أعد المحاولة.' : '⚠️ The connection dropped before the image arrived — please try again.') : (lang === 'ar' ? 'تم إيقاف إنشاء الصورة.' : 'Image generation stopped.')) : (lang === 'ar' ? 'تعذّر توليد الصورة الآن — جرّب مرّة ثانية.' : 'Image generation failed — please try again.');
  }
  renderAll(); saveState();
  try{ thinkingDiv && thinkingDiv.remove(); }catch(e){ /* guard-ok — cleanup, intentional */ }
}

// v560: تحرير رسالة قديمة يعيد المحادثة من تلك النقطة، وإعادة التوليد تعيد
// إرسال آخر سؤال بلا فقاعة مستخدم مكررة. لا نلمس واجهة الجوال في هذه المرحلة.
function setChatEditNotice(on){
  const notice = $('#chatEditNotice');
  if(!notice) return;
  notice.hidden = !on;
  const cancel = notice.querySelector('button');
  if(cancel) cancel.onclick = () => window.chatCancelEditMessage();
}
window.chatCancelEditMessage = function(){
  window.__chatEditRequest = null;
  setChatEditNotice(false);
};
window.chatStartEditMessage = function(index){
  if(document.documentElement.classList.contains('mobile-ui') || genAbortController) return false;
  const cur = getCurrent();
  const msg = cur && cur.messages && cur.messages[index];
  if(!cur || !msg || msg.role !== 'user') return false;
  window.__chatEditRequest = { projectId: cur.id, index: index };
  const prompt = $('#prompt');
  prompt.value = String(msg.content || '');
  setChatEditNotice(true);
  try{ window.__promptAutoGrow && window.__promptAutoGrow(); }catch(e){ __swallow(e, 'ui:chat-edit-grow'); }
  try{ window.__updateSendReady && window.__updateSendReady(); }catch(e){ __swallow(e, 'ui:chat-edit-ready'); }
  prompt.focus();
  prompt.setSelectionRange(prompt.value.length, prompt.value.length);
  return true;
};
window.chatRegenerateMessage = function(index){
  if(document.documentElement.classList.contains('mobile-ui') || genAbortController) return;
  const cur = getCurrent();
  if(!cur || !Array.isArray(cur.messages)) return;
  let userIndex = Math.min(Number(index) || 0, cur.messages.length - 1);
  while(userIndex >= 0 && cur.messages[userIndex].role !== 'user') userIndex--;
  if(userIndex < 0 || !window.chatStartEditMessage(userIndex)) return;
  sendPrompt();
};

/* 🔄 v-another-version (طلب المالك: «صورة ورا صورة لين ما أقتنع … نتيجة مو
   لعبة»): زر «نسخة ثانية» يعيد تنفيذ آخر طلب صورة (توليد أو تعديل) كما هو
   فيعطي تنويعة جديدة بضغطة واحدة بلا إعادة كتابة، بلا حدّ لعدد المحاولات،
   ويعمل على الجوّال (بخلاف «إعادة توليد الرد» المقيّدة بسطح المكتب). */
window.__omranLastImageReq = null;
window.omranAnotherVersion = async function(){
  if(typeof genAbortController !== 'undefined' && genAbortController) return; // طلب جارٍ
  const req = window.__omranLastImageReq;
  const cur = getCurrent();
  if(!req || !cur || !Array.isArray(cur.messages)) return;
  const __sb = document.getElementById('btnSend'); if(__sb) __sb.disabled = true;
  genAbortController = new AbortController();
  try{ __omranArmWatchdog(); }catch(e){ /* guard-ok */ }
  try{
    if(req.kind === 'gen' && req.promptText){
      await omModeGenerateImage(cur, req.promptText, null);
      return;
    }
    const __m = { role:'assistant', content: lang === 'ar' ? '🎨 أرسم لك نسخة ثانية…' : '🎨 Creating another version…', _loading:true };
    cur.messages.push(__m); renderAll();
    const __res = await fetch(req.url || '/api/maha-image', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      signal: genAbortController.signal,
      body: JSON.stringify(Object.assign({}, req.body, { token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }))
    });
    const __data = await __res.json().catch(() => ({}));
    __m._loading = false;
    if(__res.ok && __data.imageBase64){
      const __outMime = __data.mimeType || 'image/png';
      __m.content = (typeof __data.caption === 'string' ? __data.caption : '');
      __m.attachments = [{ name:'edited.png', isImage:true, mime:__outMime, dataUrl:'data:' + __outMime + ';base64,' + __data.imageBase64 }];
      cur.lastEditedImage = { b64: __data.imageBase64, mime: __outMime };
      cur.lastMsgWasImageEdit = true;
      try{ if(window.__chatStatus) window.__chatStatus.note('🎨', (/openai/.test(String(__data.engine || '')) ? 'gpt-image' : (/pro/.test(String(__data.engine || '')) ? 'نانو بنانا برو' : 'نانو بنانا'))); }catch(e){ __swallow(e, 'ui:img-engine-again'); }
    } else {
      __m.content = imgErrFriendly(__data && __data.error, lang === 'ar') || (lang === 'ar' ? '⚠️ تعذّر توليد نسخة ثانية — جرّب مرّة أخرى.' : '⚠️ Could not create another version — try again.');
    }
    renderAll(); saveState();
  }catch(e){
    if(!(e && e.name === 'AbortError')) __swallow(e, 'img:another-run');
    try{ renderAll(); saveState(); }catch(_){ /* guard-ok */ }
  }finally{
    genAbortController = null;
    try{ __omranDisarmWatchdog(); }catch(e){ /* guard-ok */ }
    try{ __omranRestoreSendBtn(); }catch(e){ /* guard-ok */ }
  }
};

// v-social-alive: deterministicSocialReply حُذفت — التحية للنموذج دائمًا.

function latestOriginalUserImage(cur){
  try{
    const messages = (cur && cur.messages) || [];
    for(let i = messages.length - 1; i >= 0; i--){
      const msg = messages[i];
      if(!msg || msg.role !== 'user' || !Array.isArray(msg.attachments)) continue;
      for(let j = msg.attachments.length - 1; j >= 0; j--){
        const image = msg.attachments[j];
        if(image && image.isImage && image.dataUrl && !image._fromMemory) return image;
      }
    }
  }catch(e){ __swallow(e, 'img:original-source'); }
  return null;
}
function cumulativeImageEditPrompt(cur, currentText, reset){
  const edits = reset ? [] : (Array.isArray(cur.imageEditInstructions) ? cur.imageEditInstructions.slice() : []);
  const clean = String(currentText || '').trim();
  if(clean && edits[edits.length - 1] !== clean) edits.push(clean);
  const prompt = edits.length <= 1 ? clean : ('طبّق جميع التعديلات التالية مجتمعة على الصورة الأصلية:\n' + edits.map((item, i) => (i + 1) + '. ' + item).join('\n') + '\nلا تغيّر أي شيء آخر.');
  return { prompt, edits };
}

// ⏱️ v586 — حارس الطلب المعلّق. المتصفّح لا يفرض مهلة على fetch وسقف
// الخادم ٣٠٠ ثانية؛ فلو تعثّر المزوّد أو جُمّدت الصفحة (قفل شاشة / تبديل
// تطبيق على الجوّال) بقي الوعد معلّقًا للأبد ⇒ كتلة finally لا تُنفّذ ⇒ زرّ
// الإرسال دوّار والنتيجة لا تصل. الحارس يقطع ويُعيد الزرّ ويقول لماذا.
var __omranWdTimer = null, __omranWdWake = null, __omranReqStartedAt = 0;
var __OMRAN_WD_HARD_MS  = 300000;  // سقف صلب = سقف الخادم نفسه
var __OMRAN_WD_STALE_MS = 120000;   // طلب أقدم من ذلك حين تعود الصفحة = مشبوه
var __OMRAN_WD_GRACE_MS = 20000;   // مهلة سماح بعد العودة قبل القطع

// إعادة زرّ الإرسال إلى هيئته الطبيعيّة (نفس أيقونة finally).
function __omranRestoreSendBtn(){
  try{
    var __b = document.getElementById('btnSend');
    if(!__b) return;
    __b.disabled = false;
    __b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' /* v-send-plane: سهم الإرسال طائرة ورقية كما في صورة المالك */;
    try{ document.getElementById('btnStop').classList.remove('live'); }catch(_){ /* guard-ok — cleanup, intentional */ }
  }catch(e){ try{ __swallow(e, 'misc:wd-restore'); }catch(_){ /* guard-ok — cleanup, intentional */ } }
}
function __omranAbortStuck(){
  try{
    if(typeof genAbortController === 'undefined' || !genAbortController) return;
    window.__omranTimedOut = true;
    genAbortController.abort();
    // ضمان أخير: لو لم تُنفّذ كتلة finally لأي سبب، يُفكّ قفل الزرّ قسرًا.
    setTimeout(function(){
      try{ var __b = document.getElementById('btnSend'); if(__b && __b.disabled) __omranRestoreSendBtn(); }catch(_){ /* guard-ok — cleanup, intentional */ }
    }, 6000);
  }catch(e){ try{ __swallow(e, 'misc:wd-abort'); }catch(_){ /* guard-ok — cleanup, intentional */ } }
}
function __omranDisarmWatchdog(){
  try{ clearTimeout(__omranWdTimer); }catch(_){ /* guard-ok — cleanup, intentional */ }
  try{ clearTimeout(__omranWdWake); }catch(_){ /* guard-ok — cleanup, intentional */ }
  __omranWdTimer = null; __omranWdWake = null; __omranReqStartedAt = 0;
}
function __omranArmWatchdog(){
  __omranDisarmWatchdog();
  window.__omranTimedOut = false;
  __omranReqStartedAt = Date.now();
  __omranWdTimer = setTimeout(__omranAbortStuck, __OMRAN_WD_HARD_MS);
}
// عودة الصفحة من الخلفيّة: طلب قديم لم يعد يُمنح مهلة سماح ثمّ يُقطع؛
// ولو بقي الزرّ معطّلًا بلا طلب جارٍ أصلًا يُفكّ قفله فورًا بلا انتظار ضغطة.
try{
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState !== 'visible') return;
    var __live = (typeof genAbortController !== 'undefined' && genAbortController);
    if(!__live){
      try{
        var __b = document.getElementById('btnSend');
        if(__b && __b.disabled && typeof __omranRestoreSendBtn === 'function') __omranRestoreSendBtn();
      }catch(_){ /* guard-ok — cleanup, intentional */ }
      return;
    }
    if(!__omranReqStartedAt || (Date.now() - __omranReqStartedAt) < __OMRAN_WD_STALE_MS) return;
    try{ clearTimeout(__omranWdWake); }catch(_){ /* guard-ok — cleanup, intentional */ }
    __omranWdWake = setTimeout(__omranAbortStuck, __OMRAN_WD_GRACE_MS);
  });
}catch(e){ try{ __swallow(e, 'misc:wd-vis'); }catch(_){ /* guard-ok — cleanup, intentional */ } }

/* v-send-unlock (شكوى المالك ٤ سبتمبر «زر الإرسال بعد المحادثة ما يشتغل»): الزرّ المعطّل لا يستقبل
   نقرًا أصلًا، فحارس v583 داخل sendPrompt لا يعمل باللمس. نلتقط اللمسة على الصندوق كلّه:
   زرّ معطّل بلا طلب جارٍ = قفل يتيم → يُفكّ فورًا فتعمل اللمسة نفسها. */
try{
  ['touchstart','pointerdown'].forEach(function(evName){
    document.addEventListener(evName, function(e){
      try{
        var box = document.getElementById('composerBox');
        if(!box || !e.target || !box.contains(e.target)) return;
        var __b = document.getElementById('btnSend');
        if(!__b || !__b.disabled) return;
        if(typeof genAbortController !== 'undefined' && genAbortController) return;
        if(typeof __omranRestoreSendBtn === 'function') __omranRestoreSendBtn();
      }catch(_){ /* guard-ok — cleanup, intentional */ }
    }, { capture: true, passive: true });
  });
}catch(e){ try{ __swallow(e, 'misc:send-unlock'); }catch(_){ /* guard-ok — cleanup, intentional */ } }

async function sendPrompt(){
  // ✅ v301: قفل الإرسال أثناء التوليد — Enter أو أي ضغطة إضافية لا ترسل
  // الطلب مرة ثانية (كان زر الإرسال ينقفل لكن Enter يظل شغالًا فيتكرر الطلب).
  // 🔓 v583 — قفل يتيم: الزرّ يبقى معطّلًا لو جُمّدت الصفحة أو انقطعت الشبكة
  // أثناء توليد صورة (المتصفّح لا يُنهي الوعد ⇒ finally لا يعمل). لو ما فيه
  // طلب جارٍ فعلًا، فُكّ القفل بدل ما يصير الزرّ «شكل بلا فعل» (بلاغ عمران).
  try{
    const __sb = $('#btnSend');
    if(__sb && __sb.disabled){
      if(typeof genAbortController !== 'undefined' && genAbortController) return;
      __sb.disabled = false;
      __sb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' /* v-send-plane: سهم الإرسال طائرة ورقية كما في صورة المالك */;
    }
  }catch(e){ __swallow(e, "misc:app-09-attach#6"); }
  const promptEl = $('#prompt');
  let text = promptEl.value.trim();
  if(!text && pendingAttachments.length === 0) return;
  if(pendingAttachments.some(a => a.pending)){
    alert(lang === 'ar' ? 'الرجاء الانتظار حتى ينتهي تحليل الأرشيف' : 'Please wait until archive analysis finishes');
    return;
  }

  // 🎬 v525: اكتشاف طلب إنشاء فيديو → فتح صانع الفيديو مباشرة
  // إذا فيه صورة: نحلّلها بـ AI ليطلع prompt إنجليزي دقيق بدل نص المستخدم الخام
  const __VID_MAKE_RE = /(?:اعمل|اصنع|سوّي|سوي|سولي|أنشئ|انشئ|ولّد|ولد|أبغى|ابغى|أبغي|ابغي|بغيت|أريد|اريد|حاب|أحتاج|احتاج|طلعلي|طلع\s+لي|صنعلي|create|make|generate|produce)\s*(?:لي\s*)?(?:فيديو|فيديوهات|فيلم|مقطع|مقاطع|كليب|أنيميشن|انيميشن|animation|video|clip|film|reel|short)|\b(?:فيلم|فيديو|مقطع)\s+(?:نفس|مثل|شبه|يوضح|يبيّن|يشرح|سينمائي|قصير|احترافي|عن\s|عمراني|فيه)|^(?:فيلم|فيديو|مقطع)\s+.{4,}/i;
  const __VID_Q_RE    = /^(?:كيف|ما|وش|ايش|أيش|هل|لماذا|why|how|what|can\s+i|where)\s|[؟?]\s*$/;
  if(text && __VID_MAKE_RE.test(text) && !__VID_Q_RE.test(text) && typeof window.omranOpenVideoMaker === 'function'){
    const __heroAtt = pendingAttachments.find(function(a){ return a.isImage && a.dataUrl; });
    promptEl.value = '';
    if(__heroAtt && __heroAtt.dataUrl){
      // صورة مرفقة — نولّد prompt إنجليزي دقيق منها أولاً
      (async function(){
        try{
          const __statusEl = document.getElementById('videoMakerStatus');
          // افتح المودال فوراً بنص مؤقت
          window.omranOpenVideoMaker('', __heroAtt.dataUrl, __heroAtt.mime || 'image/jpeg');
          // اعرض رسالة تحميل
          if(__statusEl){ __statusEl.textContent = (typeof lang !== 'undefined' && lang === 'en') ? '🔍 Analyzing image...' : '🔍 جاري تحليل الصورة...'; __statusEl.style.display = 'block'; }
          const b64 = __heroAtt.dataUrl.indexOf(',') !== -1 ? __heroAtt.dataUrl.split(',')[1] : __heroAtt.dataUrl;
          const res = await fetch('/api/video-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: b64, mime: __heroAtt.mime || 'image/jpeg' }),
          });
          if(res.ok){
            const d = await res.json();
            if(d.prompt){
              const vpEl = document.getElementById('videoMakerPrompt');
              if(vpEl) vpEl.value = d.prompt;
            }
          }
          if(__statusEl){ __statusEl.textContent = ''; __statusEl.style.display = 'none'; }
        }catch(e){ /* guard-ok — يفتح المودال على أي حال */ }
      })();
    } else {
      // بدون صورة — افتح مباشرة بنص المستخدم
      window.omranOpenVideoMaker(text, null, null);
    }
    try{ if(typeof window.__clearAttachments === 'function') window.__clearAttachments(); }catch(e){ /* guard-ok */ }
    return;
  }

  // 🔒 بوابة البناء الطبيعية: أول طلب بناء → المزود يناقش الفكرة ويختم رده
  // بسؤال «تبيني أبدأ البناء؟». البناء الفعلي لا يبدأ إلا بعد موافقة صريحة
  // (نعم/ابدأ/سو...) في الرسالة التالية — بدون أي أزرار أو شرائط.
  // فعل بناء صريح في بداية الرسالة + موضوع بعده = طلب بناء حتى لو الموضوع
  // غير موجود في القوائم (ساعة، حاسبة، آلة حاسبة...). يغطي فجوة القوائم الثابتة.
  const __strongBuildRe = /^\s*(?:(?:ممكن|ممكنك|لو\s*سمحت|من\s*فضلك|بليز|please|can\s*you|could\s*you|أبغى|ابغى|أبغي|ابغي|أبي|ابي|بغيت|أريد|اريد|ودّي|ودي|حاب|حابب|تقدر|تقدرين|أحتاج|احتاج|يا\s*ريت|ياريت|i\s*want|i\s*need)\s+){0,3}(?:تسوي|تسوّي|تسويلي|تصمم|تصمّم|تصميم|تبني|تبنيلي|تعمل|تعملي|تنشئ|تصنع|ابني|ابنيلي|نبني|اعمل|أعمل|سوي|سوّي|سولي|سوّلي|صمم|صمّم|انشئ|أنشئ|اصنع|build|create|make|design)\s+.{2,}/i;
  // 🖼️ v330: متابعة بعد تعديل صورة (بدون مرفق جديد) → مسار تعديل الصورة مباشرة
  // بآخر صورة محفوظة — ممنوع بوابة البناء وممنوع خطة عمل («ضيفه الرابط» كانت
  // تروح للبوابة فيرسم المزود الصورة من خياله بدل تعديل الأصلية).
  // v577: قائمة سوداء للمتابعة — هذه وحدها تخرج من «تعديل نفس الصورة».
  const __IMGF_NEW_RE = /(?:صورة|صوره|بطاق[ةه]|بوستر|ملصق|شهاد[ةه]|غلاف|بنر|لوجو|شعار|image|picture|card|poster)\s*(?:جديد[ةه]|ثاني[ةه]|أخرى|اخرى|new|another)(?=$|[\s،,.!?؟])|(?:^|[\s،,])(?:ارسم|أرسم|اصنع|انشئ|أنشئ|صمم|صمّم|ولّد|ولد|draw|create|generate|design)\s*(?:لي\s*)?(?:صورة|صوره|بطاق[ةه]|بوستر|ملصق|شهاد[ةه]|غلاف|بنر|لوجو|شعار|image|picture|card|poster|logo|banner)(?=$|[\s،,.!?؟])|(?:^|[\s،,])(?:صوّر|صور|صوره|صورة|تصور)\s?لي\s+\S/i; // v659: «صوّر لي X» = صورة جديدة، لا تعديل على السابقة
  const __IMGF_NOT_RE = /^(?:وش|شو|ايش|أيش|ليش|كيف|متى|وين|فين|هل|مين|كم|لماذا|ماذا|ما|من|why|how|what|where|when|who)(?=$|[\s،,.!?؟])|[؟?]\s*$|(?:^|[\s،,])(?:ابحث|دور|اعطني|أعطني|معلومات|سعر|أسعار|اسعار|فندق|فنادق|مطعم|مطاعم|طيران|تذاكر|وظيف[ةه]|وظائف|عقار|شق[ةه]|سيار[ةه]|سيارات|أخبار|اخبار|طقس|أسهم|اسهم|ذهب|search|find|price|hotel|restaurant|flight|news|weather)(?=$|[\s،,.!?؟])|^(?:شكرا|شكرًا|مشكور|تسلم|تمام|اوك|أوك|زين|طيب|ايه|أيه|نعم|لا|يب|ok|okay|thanks|yes|no)[\s!.،,]*$|(?:^|[\s،,])(?:فيديو|حركها|حركه|حرك|صوت|video|animate|audio)(?=$|[\s،,.!?؟])/i;
  // v725: أمر تعديل صريح يتغلّب على فلتر «سؤال معلومات» — «غيّر السيارة» و«شيل السعر» تعديلان لا بحث
  const __IMG_EDIT_VERB_RE = /(عدل|عدّل|تعديل|غير|غيّر|بدل|بدّل|امسح|احذف|ازل|أزل|شيل|صغر|صغّر|كبر|كبّر|اجعل|\bedit\b|\bchange\b|\bremove\b|\bdelete\b)/i;
  const __IMG_FOLLOW = (function(){
    try{
      const c = getCurrent();
      if(!c || !c.lastMsgWasImageEdit || !c.lastEditedImage || !c.lastEditedImage.b64) return false;
      if(pendingAttachments.some(a => a.isImage)) return false;
      if(!text || text.length > 220) return false;
      if(/بوت|تطبيق|برنامج|موقع|صفحة|لعبة|لعبه|سكربت|\bapp\b|\bwebsite\b|\bpage\b|\bbot\b|\bgame\b|\bscript\b|\bcode\b|كود/i.test(text)) return false;
      if(typeof window.__isExplicitImageEdit === 'function' && window.__isExplicitImageEdit(text)) return true;
      // v577: «سوي التسريحه ذيل حصان» كانت تسقط للدردشة فترسم شخصًا جديدًا.
      // الافتراضيّ الآن: تعديل على نفس الصورة، إلّا إذا طلبت صورة جديدة أو سألت.
      if(__IMGF_NEW_RE.test(text) || (__IMGF_NOT_RE.test(text) && !__IMG_EDIT_VERB_RE.test(text))) return false;
      const __wc = String(text).trim().split(/\s+/).filter(Boolean);
      if(__wc.length < 2 && String(text).trim().length < 12) return false;
      // السطر المحذوف كان: if(typeof window.__isExplicitImageEdit === 'function') return true;
      // كان يُعيد true لأي رسالة بمجرد وجود الدالة، متجاوزاً فلتر __editVerb+__priorRef.
      const __editVerb = /(عدل|عدّل|غير|غيّر|بدل|بدّل|امسح|احذف|ازل|أزل|شيل|أضف|اضف|ضيف|حط|اكتب|أكتب|خل|اجعل|كبر|كبّر|صغر|صغّر|\bedit\b|\bchange\b|\bremove\b|\badd\b|\bput\b|\bwrite\b)/i;
      // «عليها|فيها|منها» + لواحق فعلية شائعة («اجعلها/كبّرها/غيّرها...»)
      const __priorRef = /(الصورة\s+السابقة|الصوره\s+السابقه|هذه\s+الصورة|هذي\s+الصورة|هالصورة|عليها|فيها|منها|اجعلها|كبّرها|كبرها|صغّرها|صغرها|غيّرها|غيرها|عدّلها|عدلها|احذفها|امسحها|بدّلها|بدلها|شيلها|حطّها|حطها|خذها|ازلها|أزلها|\bit\b|this\s+(?:image|picture)|previous\s+(?:image|picture))/i;
      return __editVerb.test(text) && __priorRef.test(text);
    }catch(e){ return false; }
  })();
  const __entryImageTextSpec = window.__parseImageTextSpec ? window.__parseImageTextSpec(text) : { wantsText:false };
  const __explicitImageTextRequest = !!(__entryImageTextSpec.wantsText &&
    /(?:صورة|صوره|بطاقة|بطاقه|دعوة|دعوه|بوستر|ملصق|شهادة|شهاده|غلاف|بنر|شعار|لوجو|image|picture|card|invitation|poster|banner|cover|logo)/i.test(text) &&
    !/(?:تطبيق|برنامج|موقع|صفحة|لعبة|سكربت|كود|\bapp\b|\bwebsite\b|\bpage\b|\bgame\b|\bscript\b|\bcode\b)/i.test(text));
  let __gateNoBuild = false;
  let __gateApprovedText = null; // ما كتبه المستخدم فعلًا (نعم/ابدأ) ليُعرض كما هو
  {
    const GATE_BUILD_RE = /بوت|تطبيق|برنامج|موقع|صفحة|لعبة|لعبه|العاب|ألعاب|أداة|اداة|نسخة|نسخه|شهادة|شهاده|بطاقة|بطاقه|دعوة|دعوه|بوستر|شعار|لوجو|تهنئة|تهنئه|\bapp\b|\bwebsite\b|\bpage\b|\bbot\b|\bgame\b|\btool\b|\bclone\b|\bcertificate\b|\bcard\b|\binvitation\b|\bposter\b|\blogo\b/i;
    const GATE_CMD_RE = /(ابني|ابن\s|بناء|نبني|اعمل|أعمل|سوي|سوّي|صمم|صمّم|انشئ|أنشئ|انشاء|إنشاء|اصنع|ممكن|ابغي|أبغي|ابغى|أبغى|ابي|أبي|بغيت|اريد|أريد|عطني|أعطني|اعطني|هات|سولي|سوّلي|build|create|make|design|develop|\bwant\b|\bgive\b|\bcan you\b)/i;
    const GATE_FIX_RE = /(صلح|أصلح|اصلح|إصلاح|اصلاح|خطأ|خطا|أخطاء|اخطاء|مشكل|عطل|توقف|خرب|ما\s*يشتغل|مو\s*شغال|لا\s*يعمل|\bfix\b|\berror\b|\bbug\b|\bdebug\b|\bbroken\b)/i;
    const GATE_APPROVE_RE = /^\s*(نعم|أجل|اجل|اي(?:ه|وه|وا)?|إيه?|أيوه|ايوه|يلا|يالله|ابدأ|أبدأ|ابدا|ابدي|ابنيه?|ابنيها|سو|سوه|سوها|سويها|سوي|تمام|اوك|أوك|اوكي|اوكيه|موافق|زين|طيب|وافقت|yes|ok|okay|go|start|build)[\sء-ي!.،؟]{0,30}$/i;
    // الطلب المعلّق يُحفظ في localStorage أيضًا حتى لا يضيع عند تحديث الصفحة
    // بين سؤال «تبيني أبدأ؟» وموافقة المستخدم.
    let __pend = window.__pendingBuildPrompt;
    if(!__pend){ try{ __pend = localStorage.getItem('aiapp_pending_build') || null; }catch(e){ __swallow(e, "misc:app-09-attach#7"); } }
    // رسالة تحتوي طلب بناء كامل (فعل + موضوع مثل «ابني لي لعبة») = طلب جديد،
    // وليست موافقة قصيرة مثل «نعم/ابدأ» — حتى لو بدأت بكلمة تشبه الموافقة.
    // v285: نص ملصوق (طويل/متعدد الأسطر/قوائم وإشعارات 📋⬜) بدون فعل بناء صريح
    // في البداية = ليس طلب بناء أبدًا — يروح نقاش عادي فقط.
    const __looksPasted = !!(text && !__strongBuildRe.test(text) && (
      text.length > 400 ||
      text.split('\n').length >= 6 ||
      /[📋⬜☐🔹▪•✔️]/.test(text) ||
      /^\s*(?:[-*]|\d+[.)])\s+\S.*\n\s*(?:[-*]|\d+[.)])\s+\S/m.test(text)
    ));
    const __isFullBuildReq = !!(text && !__looksPasted && ((GATE_BUILD_RE.test(text) && GATE_CMD_RE.test(text)) || __strongBuildRe.test(text)));
    // 🤝 v345: موافقة قصيرة («نعم/تمام/يلا») بعد عرض بناء من المزود نفسه في
    // رده السابق («أقدر أبنيلك أداة... تبيني أبدأ فيها؟») = موافقة تنفيذ فورية
    // على ما عرضه المزود، لا إعادة تشغيل الطلب السابق المرفوض.
    let __offerApproved = false;
    if(text && !__isFullBuildReq && GATE_APPROVE_RE.test(text)){
      try{
        const __gp = getCurrent();
        const __ms = __gp ? __gp.messages : [];
        const __lastA = [...__ms].reverse().find(m => m.role === 'assistant' && m.content && !m.code);
        const OFFER_RE = /(تبيني\s*أبدأ|تبيني\s*ابدأ|تبي\s*أبدأ|تبغى\s*أبدأ|أبنيلك|ابنيلك|أبنيها|ابنيها|أسويها|اسويها|أسوي\s*لك|اسوي\s*لك|نبدأ\s*فيها|أبدأ\s*فيها|تبيني\s*أسوي|تبيني\s*اسوي|تبيني\s*أبنيها|أبدأ\s*البناء|shall i build|want me to build|start building)/i;
        if(__lastA && OFFER_RE.test(String(__lastA.content))) __offerApproved = true;
      }catch(e){ __swallow(e, "misc:app-09-attach#8"); }
    }
    // شبكة أمان إضافية: لو ضاع الطلب المعلّق نهائيًا، نسترجعه من آخر رسالة
    // بناء كتبها المستخدم في نفس المشروع.
    if(!__pend && !__offerApproved && text && !__isFullBuildReq && GATE_APPROVE_RE.test(text)){
      try{
        const __gp = getCurrent();
        const __ms = __gp ? __gp.messages : [];
        // آخر طلب بناء كتبه المستخدم في هذا المشروع
        const __lastU = [...__ms].reverse().find(m => {
          const __t = String(m.apiText !== undefined ? m.apiText : (m.content || ''));
          return m.role === 'user' && GATE_BUILD_RE.test(__t) && GATE_CMD_RE.test(__t);
        });
        if(__lastU){
          const __idx = __ms.lastIndexOf(__lastU);
          // إذا ما انبنى كود فعلي بعد ذلك الطلب → «ابدأ» معناها الموافقة على بنائه
          const __builtAfter = __ms.slice(__idx + 1).some(m => m.role !== 'user' && m.code);
          if(!__builtAfter) __pend = String(__lastU.apiText !== undefined ? __lastU.apiText : __lastU.content);
        }
      }catch(e){ __swallow(e, "misc:app-09-attach#9"); }
    }
    const __setPend = (v)=>{ window.__pendingBuildPrompt = v; try{ if(v) localStorage.setItem('aiapp_pending_build', v); else localStorage.removeItem('aiapp_pending_build'); }catch(e){ __swallow(e, "save:app-09-attach#10"); } };
    if(__offerApproved && text && !__isFullBuildReq && GATE_APPROVE_RE.test(text)){
      // موافقة على عرض المزود نفسه → يبني بالضبط ما عرضه، فورًا وبالكامل.
      __gateApprovedText = text;
      text = 'نعم، ابدأ الآن ببناء الأداة/التطبيق الذي عرضته في ردك السابق بالكامل.';
      window.__buildOfferApproved = true;
      __setPend(null);
    } else if(__pend && text && !__isFullBuildReq && GATE_APPROVE_RE.test(text)){
      // موافقة → نفّذ طلب البناء الأصلي كاملًا الآن (ويظهر بالمحادثة ما كتبه المستخدم فقط).
      __gateApprovedText = text;
      text = __pend;
      __setPend(null);
    } else if(text && !__IMG_FOLLOW && !__explicitImageTextRequest && !__looksPasted && ((GATE_BUILD_RE.test(text) && GATE_CMD_RE.test(text)) || __strongBuildRe.test(text)) && !GATE_FIX_RE.test(text)){
      __setPend(text);
      __gateNoBuild = true;
    } else if(text){
      __setPend(null);
    }
  }

  // Guest gate: users without an account get GUEST_MSG_LIMIT free messages,
  // then must log into an existing account (or sign up) to keep chatting.
  if(!authGet('aiapp_auth_token')){
    if(window.getGuestMsgCount() >= window.GUEST_MSG_LIMIT){
      window.requireLogin('guestLimit');
      return;
    }
    window.incrementGuestMsgCount();
  }

  try{ window.__fbCountMsg && window.__fbCountMsg(); }catch(_){ __swallow(_, "auth:app-09-attach#11"); }

  let cur = getCurrent();
  if(!cur){
    const id = 'p_' + Date.now();
    cur = {id, title: (text || (pendingAttachments[0] && pendingAttachments[0].name) || 'مشروع').slice(0, 30), messages: [], code: '', codeType: 'html'};
    state.projects.push(cur);
    state.currentId = id;
  }
  const __editReq = window.__chatEditRequest;
  const __editIndex = (__editReq && __editReq.projectId === cur.id && Number.isInteger(__editReq.index) &&
    __editReq.index >= 0 && __editReq.index < cur.messages.length && cur.messages[__editReq.index].role === 'user') ? __editReq.index : -1;
  const __editedOriginal = __editIndex >= 0 ? cur.messages[__editIndex] : null;
  if(cur.messages.length === 0){
    cur.title = (text || (pendingAttachments[0] && pendingAttachments[0].name) || 'مشروع').slice(0, 30);
  }

  // عند إعادة التوليد نعيد استخدام مرفقات السؤال الأصلي؛ وعند التحرير مع
  // مرفقات جديدة نعتمد الجديدة. هكذا لا تضيع الصورة/الملف بصمت.
  const attachmentsForMsg = pendingAttachments.length ? pendingAttachments.slice() :
    (__editedOriginal && Array.isArray(__editedOriginal.attachments) ? __editedOriginal.attachments.slice() : []);
  const imageAttachments = attachmentsForMsg.filter(a => a.isImage);
  const textAttachments = attachmentsForMsg.filter(a => !a.isImage);

  // Build the text sent to the AI: original text + any text-file contents appended as code blocks
  let apiText = text;
  try{ if(window.__omMode==='think') apiText = (lang==='ar'?'فكّر بعمق خطوة بخطوة، وحلّل الاحتمالات قبل أن تجيب.\n\n':'Think deeply, step by step, before answering.\n\n') + apiText; else if(window.__omMode==='learn') apiText = (lang==='ar'?'اشرح لي كمعلّم صبور: خطوات مرقّمة، أمثلة بسيطة، ثمّ سؤال يختبر فهمي.\n\n':'Teach me patiently: numbered steps, simple examples, then one question.\n\n') + apiText; }catch(e){ /* guard-ok — cleanup, intentional */ }
  textAttachments.forEach(a => {
    apiText += (apiText ? '\n\n' : '') + '📄 ' + a.name + ':\n```\n' + a.text + '\n```';
  });
  // 🛠️ أدوات إضافية: بيانات CSV/Excel → ملخص إحصائي + تعليمة تحليل بجداول Markdown
  const dataAttachments = textAttachments.filter(a => /\.(csv|tsv|xlsx)$/i.test(a.name || ''));
  if(dataAttachments.length){
    dataAttachments.forEach(a => {
      if(/\.(csv|tsv)$/i.test(a.name || '')){
        const s = summarizeCsvText(a.text || '');
        if(s) apiText += '\n\n📊 ' + a.name + ' (quick stats):\n' + s;
      }
    });
    apiText += '\n\n[SYSTEM: The user attached data file(s). Analyze the data carefully and present your findings using clear Markdown tables, key statistics, and insights. Answer in the user\'s language.]';
  }
  if(imageAttachments.length){
    apiText += (apiText ? '\n\n' : '') + '[' + t('imagesAttachedNote') + ': ' + imageAttachments.map(a => a.name).join(', ') + ']';
  }

  // 🧠 ذاكرة الصور (v293): طلب يذكر «الصورة/صورتي» بدون مرفق جديد → أرفق آخر
  // صورة من المحادثة تلقائيًا (للتعديل أو السؤال) حتى لو مرّت رسائل نصية بينهما.
  try{
    const __memRefRe = /(الصورة|الصوره|هالصورة|هالصوره|صورتي|بالصورة|بالصوره|للصورة|للصوره|نفس الصورة|نفس الصوره|نفس الشعار|هالشعار|شعاري|الشعار السابق|الشعار اللي|الشعار الي|نفس اللوجو|هاللوجو|اللوجو اللي|اللوجو الي|the image|this image|that image|the photo|this photo|the picture|this picture|same logo|this logo|that logo)/i;
    if(!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && text && __memRefRe.test(text)){
      imageAttachments.push({ isImage: true, name: 'memory.png', mime: cur.lastEditedImage.mime || 'image/png', dataUrl: 'data:' + (cur.lastEditedImage.mime || 'image/png') + ';base64,' + cur.lastEditedImage.b64, _fromMemory: true });
    }
    // v473c: بعد «وصلتني الصورة» أي رسالة تالية قصيرة تُرفق الصورة المحفوظة تلقائياً
    if(!imageAttachments.length && cur.lastEditedImage && cur.lastEditedImage.b64 && cur.lastMsgWasImageEdit && text && text.length <= 220){
      imageAttachments.push({ isImage: true, name: 'memory.png', mime: cur.lastEditedImage.mime || 'image/png', dataUrl: 'data:' + (cur.lastEditedImage.mime || 'image/png') + ';base64,' + cur.lastEditedImage.b64, _fromMemory: true });
    }
  }catch(e){ __swallow(e, "upload:app-09-attach#12"); }
  const __nextUserMessage = {role: 'user', content: (__gateApprovedText || text) || (t('imagesAttachedNote')), attachments: attachmentsForMsg.length ? attachmentsForMsg : undefined, apiText, apiImages: imageAttachments.length ? imageAttachments : undefined};
  if(__editIndex >= 0){
    // ChatGPT-like branch semantics في مخزن خطّي: التعديل يلغي الردود اللاحقة
    // ثم يولّد جوابًا جديدًا من الرسالة المعدّلة، بلا نسخ السؤال مرتين.
    cur.messages.splice(__editIndex, cur.messages.length - __editIndex, __nextUserMessage);
  } else {
    cur.messages.push(__nextUserMessage);
  }
  window.__chatEditRequest = null;
  setChatEditNotice(false);
  promptEl.value = '';
  try{ window.__promptAutoGrow && window.__promptAutoGrow(); }catch(e){ __swallow(e, "upload:app-09-attach#13"); }
  try{ $('#btnSend').classList.remove('ready'); }catch(e){ __swallow(e, "upload:app-09-attach#14"); }
  pendingAttachments = [];
  renderAttachStrip();
  // v462: توقيت — CSS class msg-anim يضاف أثناء بناء العنصر لمدة 800ms
  window.__userAnimUntil = Date.now() + 800;
  renderAll();
  saveState();

  const sendBtn = $('#btnSend');
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner"></span>';

  // Let the ⏹️ button cancel this in-flight request; it lights up while
  // generating so the user knows they can stop it and edit their message.

  genAbortController = new AbortController();
  btnStop.classList.add('live');
  __omranArmWatchdog();  // v586
/* v-err-human: أخطاء الشبكة العابرة كانت تنزل خامًا في المحادثة
   («⚠️ Load failed» عند مستخدمة حقيقية) — تُترجم لعربي واضح مع إرشاد. */
function __friendlyErr(e){
  var m = (e && e.message) ? String(e.message) : String(e || '');
  if(/Load failed|Failed to fetch|NetworkError|network error|The Internet connection|cancelled|ERR_NETWORK|ERR_INTERNET/i.test(m)){
    var ar = (localStorage.getItem('aiapp_lang') || 'ar') === 'ar';
    return ar ? 'انقطع الاتصال لحظة أثناء الرد 📡 — أعد إرسال سؤالك وسيصلك الجواب.'
              : 'Connection dropped for a moment 📡 — resend your question.';
  }
  return m;
}

  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'msg assistant';
  thinkingDiv.textContent = t('building');
  messagesEl.appendChild(thinkingDiv);
  // شريط الحالة: يُظهر خطوات العمل بدل انتظار صامت.
  const chatStatus = makeChatStatus(thinkingDiv);
  window.__chatStatus = chatStatus;
  anchorLastUserMsgTop(thinkingDiv);

  // A "continue with this only" selection (one or more providers picked from a
  // previous ask-all round) always takes priority: it lets the user keep
  // chatting with a custom subset of providers without needing to re-check
  // "ask all". If nothing is pinned, fall back to the ask-all checkbox.
  let customProviders = (cur.continueProviders && cur.continueProviders.length) ? cur.continueProviders.slice() : null;
  // 🎭 فريق العمل الثلاثي (خطة المدرب عمران):
  //   1. نقاش/أسئلة عادية  → Gemini Flash (مجاني وسريع) واحتياطه Claude Haiku.
  //   2. إصلاح/تعديل كود موجود → Claude Sonnet "خلف الكواليس".
  //   3. بناء تطبيق/موقع/بوت  → اسأل الكل بالدمج (بدون أي تغيير).
  const __routeBuildRe = /بوت|تطبيق|برنامج|موقع|صفحة|لعبة|لعبه|العاب|ألعاب|أداة|اداة|نسخة|نسخه|شهادة|شهاده|بطاقة|بطاقه|دعوة|دعوه|بوستر|شعار|لوجو|تهنئة|تهنئه|\bapp\b|\bwebsite\b|\bpage\b|\bbot\b|\bgame\b|\btool\b|\bclone\b|\bcertificate\b|\bcard\b|\binvitation\b|\bposter\b|\blogo\b/i;
  const __routeFixRe = /(صلح|أصلح|اصلح|إصلاح|اصلاح|خطأ|خطا|أخطاء|اخطاء|مشكل|عطل|توقف|خرب|ما\s*يشتغل|مو\s*شغال|لا\s*يعمل|\bfix\b|\berror\b|\bbug\b|\bdebug\b|\bbroken\b)/i;
  // ✏️ نية تعديل على المشروع المفتوح: فعل تعديل (عدّل/غيّر/حط/بدل/خل...) +
  // عنصر داخل التصميم (نص/شعار/لون/خلفية/زر...) → يروح لمسار التعديل الحقيقي
  // (Claude + الكود الحالي + إلزام إرجاع الملف كاملاً) بدل وضع النقاش الممنوع
  // فيه الأكواد — هذا كان سبب رد "تم عدّلت" الوهمي بدون أي تغيير فعلي.
  const __editVerbRe = /(عدل|عدّل|غير|غيّر|بدل|بدّل|ضيف|أضف|اضف|حط|خل|اجعل|زيد|زد|كبر|كبّر|صغر|صغّر|لون|لوّن|احذف|امسح|ازل|أزل|شل|شيل|رتب|حسن|حسّن|كتب|اكتب|أكتب|وضح|وضّح|\badd\b|\bchange\b|\bedit\b|\breplace\b|\bremove\b|\bmake\b|\bset\b|\bput\b)/i;
  const __editObjRe = /(نص|كلام|كلمة|جملة|عبارة|شعار|لوجو|لون|ألوان|الوان|خلفية|صورة|زر|عنوان|اسم|أسماء|اسماء|تصميم|صفحة|خط|حجم|مكان|رقم|تاريخ|شكل|أيقونة|ايقونة|إطار|اطار|بطاقة|بوستر|دعوة|شهادة|مستطيل|مربع|دائرة|دايرة|خانة|خانه|عنصر|قسم|جزء|سطر|جدول|قائمة|أصفر|اصفر|أحمر|احمر|أخضر|اخضر|أزرق|ازرق|ذهبي|فضي|أسود|اسود|أبيض|ابيض|بنفسجي|وردي|برتقالي|\btext\b|\blogo\b|\bcolor\b|\bbackground\b|\bbutton\b|\btitle\b|\bfont\b|\bimage\b|\bname\b|\bbox\b|\brectangle\b|\bcircle\b|\bsection\b|\brow\b)/i;
  // سؤال استفهامي واضح (شو/كيف/ليش...) = نقاش، مو أمر تعديل.
  const __questionStartRe = /^(شو|وش|ايش|إيش|كيف|ليش|ليه|هل|متى|وين|كم|ما هو|ماهو|من هو|what|how|why|when|where|who)\b/i;
  // مشروع مفتوح + فعل تعديل → مسار التعديل الحقيقي حتى لو العنصر مو في القائمة
  // (كان "شيل المستطيل الأصفر" يروح للنقاش فيرد "شلت" بدون أي كود — خطأ 26/7).
  /* v-img-write-first (لقطة عمران: أرفق صورته وطلب الكتابة عليها فرسم
     التطبيق طفلًا آخر): وجود كود سابق بالمحادثة كان يخطف «اكتب عليها…»
     لمسار تعديل الكود. صورة مرفقة + نية كتابة = الكتابة على صورته هو،
     ولها الأسبقية المطلقة على أي مسار كود. */
  const __imgWriteAsk = !!(pendingAttachments.some(a => a.isImage)) && /(اكتب|أكتب|حط\s|ضيف|أضف|اضف|write|put|add)/i.test(text || '');
  const __editIntent = !__imgWriteAsk && !!cur.code && __editVerbRe.test(text) && (__editObjRe.test(text) || (!__questionStartRe.test(text.trim()) && text.trim().length <= 90));
  const __routeFix = (__routeFixRe.test(text) || __editIntent) && !!cur.code && !__imgWriteAsk;
  // البناء لا يبدأ إلا بفعل أمر صريح (ابني/بناء/سوي/اعمل...) + كلمة تطبيق/موقع/بوت.
  const __routeCmdRe = /(ابني|ابن\s|بناء|نبني|اعمل|أعمل|سوي|سوّي|صمم|صمّم|انشئ|أنشئ|انشاء|إنشاء|اصنع|اضف|أضف|عدل|عدّل|طور|طوّر|حدث|حدّث|كمل|أكمل|اكمل|ممكن|ابغي|أبغي|ابغى|أبغى|ابي|أبي|بغيت|اريد|أريد|عطني|أعطني|اعطني|هات|سولي|سوّلي|(?:^|\s)سو\s|build|create|make|design|develop|add|update|improve|\bwant\b|\bgive\b|\bcan you\b)/i;
  // 🚫 قرار نهائي (26/7): "اسأل الكل" ملغي بالكامل — لا زر ولا كتابة.
  // كلود يبني ويرد بروحه دائمًا (وGPT احتياط صامت إذا فشل).
  const __askAllExplicit = false;
  customProviders = null;
  const askAll = !!customProviders || __askAllExplicit || (!__gateNoBuild && !__gateApprovedText && ((__routeBuildRe.test(text) && __routeCmdRe.test(text)) || __strongBuildRe.test(text)) && !__routeFix);
  // آخر نص كامل وصل من البث؛ نحتفظ به إذا أوقف المستخدم التوليد.
  let __lastStreamPartial = '';

  try{
    // v-social-alive: الردود المخزنة الحرفية حُذفت نهائيًا بطلب
    // المالك — «انا اكلم الذكاء الاصطناعي مش قوالب». كل تحية تمر للنموذج
    // ببصمة الشخصية، والخادم يعزلها عن الذاكرة والمواضيع القديمة بنفسه.
    // 🤖 وكيل عمران: وضع الوكيل المستقل (Claude Sonnet 4 + أدوات) — يخطط ويبحث ويبني.
    if(window.__agentModeOn && !imageAttachments.length){
      await runOmranAgent(cur, apiText, thinkingDiv);
      return;
    }
    // 🎯 v526: الوضع الصريح @صورة — يتخطّى كلّ الكواشف ويولّد مباشرة
    if(window.__omMode === 'image' && apiText && !imageAttachments.length){
      await omModeGenerateImage(cur, apiText, thinkingDiv);
      return;
    }
    // 🏛️ شعارات الجهات الحقيقية: "عطني شعار شرطة دبي" → جلب الشعار الأصلي
    // من البحث المباشر وعرضه صورًا في الشات (بدون رسم نسخة مقلدة).
    // "صمم لي لوجو" (تصميم جديد) يظل على مسار التصميم العادي.
    const __logoFetchRe = /شعار|لوجو|\blogo\b/i;
    const __logoDesignRe = /(صمم|صمّم|تصميم|ابتكر|انشئ|أنشئ|إنشاء|انشاء|اعمل|أعمل|سوي|سوّي|ابني|اقترح|\bdesign\b|\bcreate\b|\bmake\b|\binvent\b)/i;
    // v295: 🖼️ بحث صور حقيقي عام — "عطني/هات/وريني صور [أي شي]" → صور حقيقية من النت
    const __photoFetchRe = /(عطني|أعطني|اعطني|هات|جيب|وريني|أرني|ارني|اعرض|ابغي|أبي|ابي|اريد|أريد|show me|give me|find me)[^]{0,40}?(صور|صورة|photos?|images?|pictures?)/i;
    const __genDrawRe = /(ارسم|ولّد|ولد لي|تخيل|اصنع|صمم|أنشئ صورة|انشئ صورة|generate|draw|imagine)/i;
    // v322: "لوجو لتطبيقي/لشركتي/دعاية..." = تصميم جديد، مو بحث عن شعار رسمي موجود
    const __logoNewRe = /(لتطبيق|لموقع|لشرك|لمشروع|لمتجر|لقناة|لبراند|لعلامت|لمطعم|لمحل|دعاي|اعلان|إعلان|جديد|خاص|هوية|براند|for my|my app|my site|my brand|my company|new logo|(لي|إلي|الي|حق|حگ)\s*(تطبيق|موقع|شرك|مشروع|متجر|قناة|براند|مطعم|محل))/i;
    // v324: سؤال/متابعة عن شعار سبق ذكره بالمحادثة (وين الشعار اللي عطيتك...) = مو بحث — يروح للمزود عادي
    const __logoRefRe = /(عطيتك|أعطيتك|اعطيتك|أرفقت|ارفقت|رفعت|حطيت|اللي عطيت|الي عطيت|وين|فين|ليش|ما استخدمت|مااستخدمت|استخدم|ضفه|أضفه|اضفه|حطه|بدله|غيره|عدله)/i;
    // 🧭 v326 القبطان: بوابة بحث الشعارات الرسمية تفتح فقط في أول رسالة
    // بمحادثة جديدة. محادثة فيها موضوع جاري = البوابة مقفولة نهائيًا مهما
    // كانت الكلمات — «وين لوجو/هات الشعار» بنص المحادثة تروح للمزود يكمل
    // على نفس الموضوع من السياق.
    const __freshChat = cur.messages.filter(m => m.role === 'user').length <= 1;
    const __isLogoFetch = __freshChat && __logoFetchRe.test(text) && !__logoDesignRe.test(text) && !__logoNewRe.test(text) && !__logoRefRe.test(text) && !(cur && cur.code);
    // v-design-img-followup (لقطات عمران ٢٧ أغسطس): «عطني صورة التصميم/الفكرة»
    // بعد نقاش تصميم كان يُخطف لبحث صور حقيقية فيرجع صور أجنبية لا علاقة لها —
    // الإشارة لتصميمٍ من المحادثة نفسها ليست بحثًا: تمر للنموذج فيرسمها.
    const __designCtxRe = /التصميم|التصور|التصوّر|الفكر[ةه]|المخطط|تصميم(ك|ي|نا)|فكرت(ك|ي)|اللي (رسمت|صممت|فوق)|الي (رسمت|صممت|فوق)|نفس (التصميم|الفكر)/;
    // v-photo-make (لقطة عمران: «صورة جميلة عليها دعاء الجمعة» رُدّت بفشل جلب):
    // «صورة عليها/مكتوب عليها…» طلب صناعة لا جلب — يمر للنموذج فيرسمها.
    const __photoMakeRe = /عليها|عليه\s|مكتوب|اكتب|دعاء|أدعي[ةه]|تهنئ|بطاق[ةه]|معايد|قالب|بوستر|منشور/i;
    const __isPhotoFetch = !__isLogoFetch && __photoFetchRe.test(text) && !__genDrawRe.test(text) && !__designCtxRe.test(text) && !__photoMakeRe.test(text) && !cur.adMode && !cur.awaitingAdMode;
    if(!imageAttachments.length && !__editIntent && (__isLogoFetch || __isPhotoFetch)){
      const __logoMsg = { role: 'assistant', content: lang === 'ar' ? (__isLogoFetch ? '🔍 أجيب لك الشعار الأصلي من البحث…' : '🔍 أجيب لك صور حقيقية من البحث…') : '🔍 Fetching real images from live search…', _loading: true };
      cur.messages.push(__logoMsg);
      renderMessages(true);
      // v-photo-ctx: «عطني صور السيارة» بعد نقاش عن ليوبارد 8 كانت تجيب سيارات
      // عشوائية — البحث كان بالكلمات الحرفية. الطلب القصير المُشير (السيارة ·
      // الفندق · هذي…) يُثرى بموضوع آخر رسالة مستخدم سابقة فتُطلب صور
      // الموضوع نفسه لا الكلمة العامة.
      // v-photo-clean: «صور لي هواتف هواوي» أعادت صفر صور — كلمات «صور/لي»
      // تخرّب بحث الصور في كل المزوّدين. يُبحث عن الشيء نفسه لا عن كلمة «صور».
      let __photoQ = text.replace(/عطني|أعطني|اعطني|هات|جيب|ابغي|أبي|اريد|أريد|وريني|أرني|ارني|اعرض/g, '')
        .replace(/(^|\s)(صور|صورة|صوره|photos?|images?|pictures?|لي|لى|بعض|شوية|شوي)(?=\s|$)/gi, ' ')
        .replace(/\s+/g, ' ').trim();
      if(!__photoQ) __photoQ = text.replace(/عطني|أعطني|اعطني|هات|جيب/g, '').trim();
      try{
        if(!__isLogoFetch && __photoQ.length < 45 && /(السيار|الفندق|المطعم|المكان|الجهاز|المنتج|الهاتف|الجوال|الشق|الفيلا|الطائر|هذي|هذه|هذا|نفسه|نفسها)/.test(text)){
          const __prevU = [...cur.messages].reverse().find(m => m && m.role === 'user' && typeof m.content === 'string' && m.content.trim() !== text.trim() && m.content.trim().length > 4);
          if(__prevU) __photoQ = __prevU.content.replace(/\s+/g, ' ').trim().slice(0, 70) + ' ' + __photoQ;
        }
      }catch(e){ __swallow(e, 'photo:ctx'); }
      try{
        const __lr = await fetch('/api/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: __photoQ + (__isLogoFetch ? ' logo png' : ''), images: true, lang, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() })
        });
        const __ld = await __lr.json();
        const __imgs = (Array.isArray(__ld.images) ? __ld.images : []).slice(0, 4);
        if(__imgs.length){
          __logoMsg._loading = false;
          __logoMsg.content = lang === 'ar' ? (__isLogoFetch ? 'هذا الشعار الأصلي من البحث المباشر 👇 اضغط على الصورة لعرضها كبيرة، أو حمّلها مباشرة.' : 'هذي صور حقيقية من البحث المباشر 👇 اضغط على أي صورة لعرضها كبيرة، أو حمّلها مباشرة.') : 'Here are real images from live search 👇';
          __logoMsg.attachments = __imgs.map((u, i) => ({ isImage: true, dataUrl: (typeof u === 'string' ? u : (u && u.url) || ''), name: (__isLogoFetch ? 'logo-' : 'photo-') + (i + 1) + '.png' })).filter(a => a.dataUrl);
        } else if(__isLogoFetch){
          __logoMsg._loading = false;
          __logoMsg.content = lang === 'ar' ? 'ما حصلت الشعار في البحث المباشر 😕 جرب تكتب اسم الجهة بشكل أوضح (مثال: "شعار شرطة دبي").' : 'Could not find the logo via live search. Try a clearer name.';
        } else {
          /* v-photo-fallthrough (عقل واحد): فشل جلب الصور لا يعود رسالة فشل
             مخزنة — الطلب يمرّ للنموذج فيرسم المطلوب أو يتصرف بذكائه. */
          cur.messages = cur.messages.filter(m => m !== __logoMsg);
          renderMessages(true);
          throw { __fallthrough: true };
        }
      }catch(e){
        if(e && e.__fallthrough){
          /* يكمل المسار الطبيعي للنموذج تحت */
        } else if(__isLogoFetch){
          __logoMsg._loading = false;
          __logoMsg.content = lang === 'ar' ? 'تعذر جلب الشعار الآن — جرب مرة ثانية.' : 'Could not fetch the logo right now — try again.';
        } else {
          cur.messages = cur.messages.filter(m => m !== __logoMsg);
          renderMessages(true);
        }
      }
      const __photoHandled = cur.messages.includes(__logoMsg);
      if(__photoHandled){
        renderAll(); saveState();
        thinkingDiv && thinkingDiv.remove();
        return;
      }
      /* لم يُعالج — يسقط للنموذج (عقل واحد) */
    }
    // 🖼️ تعديل الصور بالأوامر النصية: صورة مرفقة + طلب تعديل → Gemini يرجع الصورة معدّلة
    // Follow-up edits on the same image work too ("زين، الحين كبّر الخط").
    const __imgEditRe = /(?:^|[\s،,.!؟?()"'«»])(?:تعديل|عدل|عدّل|شيل|ابعد|أبعد|غير|غيّر|ضيف|أضف|اضف|حط|امسح|احذف|ازل|أزل|اجعل|خل|لون|لوّن|كبر|كبّر|صغر|صغّر|زخرف|اكتب|ارسم|حسن|حسّن|حول|حوّل|صمم|صمّم|نسق|نسّق|رتب|رتّب|ديكور|سوي|سوّي|سولي|دمج|ادمج|أدمج)|سو لي|\b(?:edit|change|add|put|remove|erase|make|recolor|write|draw|enhance|convert|transform|redesign|restyle|decor|merge|combine)\b/i; // v720: مطابقة على بداية كلمة فقط — «ادخل» ليست «خل» و«احوله» تبقى تمر عبر استثناء المواضيع
    const __srcImg = imageAttachments.length ? imageAttachments[imageAttachments.length - 1] : null;
    /* v-support-q (لقطة عمران ١ سبتمبر: «عندي مشكلة في الطباعة تصور خارج
       الصورة... كيف اسوي الإعدادات» راحت لتعديل صورة قديمة): سؤال مساعدة
       يحوي كلمات صور عرضًا (تصور/الصورة/تعديل) — نمنع توجيهه للصور حين لا
       يوجد مرفق صورة جديد. علاماته: شكوى/سؤال «كيف/ليش» عن إعداد أو ميزة. */
    /* v-support-multi: كلمات الشكوى/السؤال بلغات المقيمين أيضًا (إنجليزي،
       أوردو، هندي، بنغالي...) حتى لا يُوجَّه سؤال دعم للصور بأي لغة. */
    const __supIssueRe = /(?:عندي|فيه|صار|طلع|يطلع|ما\s*(?:يشتغل|يفتح|يظهر)|مايشتغل|مايفتح|تعذّ?ر|خطأ|مشكل[ةه]|عالق|problem|issue|error|not\s*work|doesn'?t\s*work|can'?t|unable|مسئلہ|مسئله|خرابی|काम नहीं|समस्या|সমস্যা)/i;
    const __supTopicRe = /(الطباع[ةه]|الإعدادات|الاعدادات|الآيفون|الايفون|الأندرويد|الاندرويد|الكمبيوتر|المتصفح|الشاشة|الشاشه|التطبيق|الحساب|الإشعارات|الاشعارات|الصوت|الكاميرا|الموقع|الشبك[ةه]|الواي\s*فاي|print|setting|iphone|android|screen|camera|account|notification|wifi|wi-fi|app\b|براوزر|سیٹنگ|प्रिंट|सेटिंग|প্রিন্ট|সেটিং)/i;
    const __supHowRe = /(?:^|[\s،,])(?:كيف|ليش|وش\s*السبب|ايش\s*السبب|why|how|kaise|kaisay|kese|कैसे|کیسے|কিভাবে)[\s\S]{0,60}(الطباع[ةه]|الإعدادات|الاعدادات|أسوي|اسوي|أعمل|اعمل|أضبط|اضبط|أفعّ?ل|افعل|settings?|print|enable|change|fix|setup|set\s*up)/i;
    const __isSupportQ = !!(text && !__srcImg && ((__supIssueRe.test(text) && __supTopicRe.test(text)) || __supHowRe.test(text)));
    /* v-font-ask (لقطة عمران: «عدل الخط» وحدها راحت لمحرر الصور فطلعت
       «مشغولة»): أمر الخط الناقص يسأل محليًا عن الخط واللون والمكان —
       ويعرض الخطوط العشرة — بدل مغامرة توليد. */
    if(/^\s*(?:عدل|عدّل|غير|غيّر|تعديل)\s*(?:الخط|النص|الكتاب[ةه])\s*[.!؟?]*\s*$/i.test(text || '') && cur.imageTextLayer && cur.imageTextLayer.baseB64){
      try{ thinkingDiv && thinkingDiv.remove(); }catch(_){ /* guard-ok — cleanup, intentional */ }
      cur.messages.push({role:'assistant',content: lang==='ar'
        ? 'أبشر! قل لي وش تبي بالضبط وأعدّله فورًا على نفس الصورة ✍️\n\n• الخط: ديواني · ثلث · كوفي · نسخ · رقعة · فارسي · قرآني · عثماني\n• اللون: ذهبي · أبيض · أسود · أخضر · أزرق · أحمر · بيج\n• المكان: الأعلى · الوسط · الأسفل\n\nمثال: «غيّر الخط إلى ديواني ولونه ذهبي في الوسط»'
        : 'Sure! Tell me exactly what to change ✍️ Font: diwani · thuluth · kufi · naskh · ruqaa · farsi · quran — Color: gold · white · black · green · blue · red — Position: top · middle · bottom'});
      renderAll(); saveState();
      return;
    }
    // 🖊️ v727: «تعديل» أو «عدل» لوحدها بعد صورة → نسأل محليًا وش التعديل بدل رد دردشة عشوائي
    if(/^\s*(?:تعديل|عدل|عدّل|edit)\s*[.!؟?]*\s*$/i.test(text || '') && ((cur.lastEditedImage && cur.lastEditedImage.b64) || pendingAttachments.some(a => a.isImage) || __srcImg)){
      try{ thinkingDiv && thinkingDiv.remove(); }catch(_){ /* guard-ok — cleanup, intentional */ }
      cur.messages.push({role:'assistant',content: lang==='ar' ? 'تمام — اكتب وش التعديل اللي تبيه على الصورة (مثال: شيل الخلفية، غيّر اللون، اكتب اسم…) ✏️' : 'Sure — describe the edit you want on the image ✏️'});
      renderAll(); saveState();
      return;
    }
    const __codeWordRe = /(كود|تطبيق|موقع|صفحة|زر\s|لعبة|سكربت|code|app|website|page|button|game|script)/i;
    const __ATT_VISION_RE = /(ترجم|translate|اقرأ|اقري|إقرأ|قراءة|\bread\b|وصف|اوصف|صف\s|describe|حلل|حلّل|analyz|قارن|compare|(?:^|[\s،,])(?:وين|فين|شلون|ليش|متى|هل|وش|ايش|أيش|شو|كيف|ماذا)(?=[\s؟?]|$)|مواصفات|مواصفه|مواصفة|سعر|سعره|بكم|كم\s*سعر|نوع|موديل|ماركة|ماركه|جهاز|معلومات\s*عن|متابعة|إجراء|اجراء|إجراءات|اجراءات|معاملة|معامله|خدمة|خدمه|طلب|حجز|موعد|رخصة|رخصه|شهادة|شهاده|فاتورة|فاتوره|سداد|استعلام|منصة|منصه|بوابة|بوابه|حساب|باي\s*بال|بايبال|paypal|بنك|تجاري|اشتراك|تفعيل|تسجيل|إعدادات|اعدادات|رصيد|فلوس|أموال|اموال|جوجل\s*بلاي|قوقل|google\s*play|app\s*store|\baccount\b|\bsettings\b|sign\s*up|log\s*in)/i; // v719: أسئلة الحسابات والخدمات مع صورة = سؤال محادثة، ليست تعديل صورة. v-assistant2: أضيف مواصفات/سعر/نوع/موديل/إجراءات/خدمة = سؤال مساعد لا توليد صورة
    const __nanoQ = /[؟?]\s*$|^\s*(?:وش|شو|ايش|أيش|ليش|كيف|متى|وين|فين|هل|مين|كم|لماذا|ماذا|why|how|what|where|when|who)(?=$|[\s،,])/i;
    // 🧠 v293: أي صورة مرفقة جديدة تنحفظ كآخر صورة في المحادثة
    if(__srcImg && !__srcImg._fromMemory){
      cur.lastEditedImage = { b64: (__srcImg.dataUrl || '').split(',')[1] || '', mime: __srcImg.mime || 'image/png' };
      cur.imageEditInstructions = [];
      cur.imageEditSource = null;
      cur.imageTextLayer = null;
      cur.adMode = null; // صورة جديدة = وضع إعلان جديد
    }
    const __followUp = !__srcImg && cur.lastEditedImage && cur.lastMsgWasImageEdit && __IMG_FOLLOW;
    // 🌟 v605 — ترقية المشهد. «أعطني الأفضل» و«طبّق التوصيات» كانت تسقط
    // للدردشة (اعطني داخل __IMGF_NOT_RE) فيرجع كلام بلا صورة؛ ولو وصلت لمسار
    // التعديل فالبند ٧ في buildEditPrompt يأمر بإرجاع الصورة كما هي. هذا مسار
    // منفصل: نفس المكان ونفس الزاوية + ترقية كاملة، وبلا إعادة رفع الصورة.
    const __IMG_UPGRADE_RE = /(?:^|[\s،,])(?:أعطني|اعطني|عطني|أعطيني|اعطيني|أبي|ابي|أبغى|ابغى|أبغي|ابغي|أريد|اريد|ودّي|ودي|هات)\s*(?:لي\s*)?(?:نسخ[ةه]\s*)?(?:ال)?(?:أفضل|افضل|أحسن|احسن|أرقى|ارقى|أجمل|اجمل)(?=$|[\s،,.!?؟])|(?:^|[\s،,])(?:طبّق|طبق|نفّذ|نفذ|سوّي|سوي)\s*(?:لي\s*)?(?:كل\s*)?(?:ال)?(?:توصيات|اقتراحات|تحسينات|ترقي[ةه]|خطوات)(?=$|[\s،,.!?؟])|(?:^|[\s،,])(?:حسّن|حسن|طوّر|طور|جدّد|جدد|جمّل|جمل|رقّي)(?:ها|ه|\s*(?:ال)?(?:صور[ةه]|غرف[ةه]|مكان|مشهد|ديكور|تصميم|جلس[ةه]|صال[ةه]))(?=$|[\s،,.!?؟])|(?:^|[\s،,])(?:خلّها|خلها|خلّه|خله|اجعلها|اجعله|صيّرها|سوّها)\s*(?:ال)?(?:أفضل|افضل|أحسن|احسن|فخم[ةه]|فخم|أرقى|ارقى|أجمل|اجمل|راقي[ةه])(?=$|[\s،,.!?؟])|(?:apply\s+(?:the\s+)?(?:recommendations|suggestions|upgrades)|(?:make|upgrade|improve|enhance)\s+(?:it|the\s+(?:room|space|place|scene|photo|image))|give\s+me\s+(?:the\s+)?best|best\s+version)/i;
    const __IMG_UPGRADE_SRC = (!__srcImg && !(cur.lastEditedImage && cur.lastEditedImage.b64)) ? latestOriginalUserImage(cur) : null;
    const __IMG_UPGRADE_NOT_RE = /(?:^|[\s،,])(?:ابحث|دور|بحث|معلومات|سعر|أسعار|اسعار|أخبار|اخبار|طقس|فندق|مطعم|طيران|وظيف[ةه]|search|find|news|weather|price|hotel|flight)(?=$|[\s،,.!?؟])|[؟?]\s*$/i;
    /* v-bold-wins (المالك: «أفضل من هذي» رجّع نفس الصورة): طلب المقارنة «أفضل/أقوى
       من هذي» = إعادة تخيّل جريئة لا ترقية محافظة — نستثنيه من مسار ترقية المشهد
       ليعامله الخادم كإعادة تصوّر. «أعطني الأفضل» (للغرف) يبقى ترقية كما هو. */
    const __IMG_REIMAGINE_HINT = /(?:أقوى|اقوى|(?:أفضل|افضل|أحسن|احسن)\s*من|فكرة\s*(?:أقوى|اقوى|أبدع|ابدع)|من\s*هذي|من\s*هذه|من\s*هذا)(?=$|[\s،,.!؟?])/.test(text || '');
    const __IMG_UPGRADE = !!(text && text.length <= 140 && __IMG_UPGRADE_RE.test(text) && !__IMG_REIMAGINE_HINT && !__IMG_UPGRADE_NOT_RE.test(text) && !__codeWordRe.test(text) && !__IMGF_NEW_RE.test(text) && (__srcImg || (cur.lastEditedImage && cur.lastEditedImage.b64) || __IMG_UPGRADE_SRC));
    const __IMG_ELEVATE = !!(text && text.length <= 140 && __IMG_REIMAGINE_HINT && !__IMG_UPGRADE_NOT_RE.test(text) && !__codeWordRe.test(text) && !__IMGF_NEW_RE.test(text) && (__srcImg || (cur.lastEditedImage && cur.lastEditedImage.b64) || __IMG_UPGRADE_SRC));
    // v311: رسالة تفاصيل إضافية أثناء تصميم إعلان قائم → تكمل التصميم نفسه.
    if(text && cur.adMode && !cur.awaitingAdMode && !__codeWordRe.test(text) && text.indexOf('ملاحظة للنظام') === -1){
      text += '\n(ملاحظة للنظام: هذه تفاصيل إضافية للإعلان قيد التصميم — أكمل/حدّث تصميم الإعلان الكامل بهذه التفاصيل حسب قالب ' + (cur.adMode === 'inside' ? 'INSIDE فوق صورة المستخدم background-image:url(\'__USER_IMAGE__\')' : 'OUTSIDE مع src="__USER_IMAGE__"') + ' وأعد الملف كاملًا. ممنوع البحث في الإنترنت وممنوع عرض إعلانات مواقع أخرى وممنوع الرد بنص فقط)';
    }
    // 📄 v314: «حطه في PDF / حوله PDF» → التطبيق نفسه يجهز PDF من آخر رد
    if(text && !__srcImg && !cur.awaitingAdMode && /(بي\s*دي\s*[اإ]ف|pdf)/i.test(text) && /(حط|حوّ?ل|سو|سوّ?ي|اعمل|أعمل|صدّ?ر|نزّ?ل|انزل|أنزل|اطبع|جهّ?ز|ممكن|ابي|أبي|ابغي|أبغي|اريد|أريد|عطني|أعطني|هات|save|make|convert|export|put)/i.test(text)){
      let __pdfSrc = null;
      for(let __i = cur.messages.length - 1; __i >= 0; __i--){
        const __m = cur.messages[__i];
        if(__m.role !== 'user' && __m.content && !__m._loading && String(__m.content).length > 60){ __pdfSrc = String(__m.content); break; }
      }
      if(__pdfSrc){
        exportTextAsPdf(__pdfSrc);
        renderAll(); saveState();
        return;
      }
    }
    // 🪧 v300: سؤال داخل/خارج قبل تصميم إعلان على صورة مرفقة
    const __adIntentRe = /(إعلان|اعلان|أعلان|للبيع|للإيجار|للايجار)/i;
    if(text && cur.awaitingAdMode){
      // v311: «ثنتين/الاثنين/كلاهما» = داخل (صورة كاملة + كل التفاصيل فوقها).
      const __ansInside = /(داخل|فوق|عليها|على الصور|ثنتين|ثنتينهم|الاثنين|الإثنين|الثنتين|كلاهما|كليهما|الكل|both|inside)/i.test(text);
      const __ansOutside = !__ansInside && /(خارج|برا|بره|براها|تحت|حول|outside)/i.test(text);
      if(!__ansInside && !__ansOutside){
        // v311: رد غامض → نعيد السؤال باختصار بدل ما يضيع الطلب.
        cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? 'رد بكلمة وحدة بس: **داخل** (كل التفاصيل مكتوبة فوق الصورة) أو **خارج** (الصورة بروحها والتفاصيل تحتها).' : 'One word please: **inside** (details written over the photo) or **outside** (photo alone, details below it).') });
        renderAll(); saveState();
        return;
      }
      cur.awaitingAdMode = false;
      const __orig = cur.pendingAdText || '';
      cur.pendingAdText = null;
      if(__ansInside){
        cur.adMode = 'inside';
        if(__orig) text = __orig;
        if(cur.lastEditedImage && cur.lastEditedImage.b64){
          text += '\n(ملاحظة للنظام: المستخدم أرفق صورة لهذا الإعلان — اجعلها خلفية البوستر الكاملة باستخدام background-image:url(\'__USER_IMAGE__\') بالضبط، وصمم الإعلان الكامل حسب قالب INSIDE: كل التفاصيل والسعر وأي أرقام أعطاها المستخدم على بطاقات زجاجية أنيقة فوق الصورة — ممنوع الاكتفاء بلافتة أو كلمة وحدة)';
        }
      } else {
        cur.adMode = 'outside';
        if(__orig) text = __orig;
        if(cur.lastEditedImage && cur.lastEditedImage.b64){
          text += '\n(ملاحظة للنظام: المستخدم أرفق صورة لهذا الإعلان — اجعلها صورة البطل باستخدام src="__USER_IMAGE__" بالضبط، والتفاصيل خارج الصورة حسب قالب OUTSIDE)';
        }
      }
    } else if(text && cur.__stPending && (/^\s*([1-9]|1[0-9])\s*$/.test(text) || /فضاء|كواكب|صاروخ|ديناصور|دايناصور|أميرة|اميرة|برنسيس|ملكة|كرة|كوره|رياضة|رياضه|بحر|سمك|قرش|شاطئ|سيار|سباق|يونيكورن|قوس قزح|حيوان|غابة|باندا|ورد|زهور|فراش|تراث|صقر|روبوت|حلوى|حلويات|كيك|دونات|كلاسيكي|مدرسي كلاسيكي|كرومي|ماي ملدي|ميلودي|هالو كاتي|هيلو كيتي|كيتي|الدبب|دببة|قيمنق|قيمنج|جيمنج|جيمر|بلايستيشن|أنمي|انمي|مانجا|ستريت|سكيت|قرافيتي|جرافيتي|مغامر|طعوس|دباب|اوف رود|أوف رود|أساطير|اساطير|ذئب|تنين|بناتي|استاتيك|اسثتيك|فاشن|موضة|موضه|مكياج|فاجئني|عشوائي/i.test(text)) && text.length < 60){
      // 🏷️ v732: المستخدم اختار ثيم الطوابع من قائمة الاقتراحات
      const __sp = cur.__stPending; cur.__stPending = null;
      const __numMap = {1:'فضاء',2:'ديناصور',3:'أميرة',4:'كرة',5:'بحر',6:'سيارة سباق',7:'يونيكورن',8:'حيوانات',9:'ورد',10:'مدرسي كلاسيكي',11:'تراث صقر',12:'روبوت',13:'حلويات',14:'فراشة',15:'كرومي',16:'ماي ملدي',17:'هالو كاتي',18:'الدببة الثلاثة'};
      const __nm = text.match(/^\s*([1-9]|1[0-4])\s*$/);
      const __stHint = __nm ? __numMap[Number(__nm[1])] : text;
      __showImgLoading(thinkingDiv, 'جارٍ تصميم الطوابع', 'Designing stamps');
      try{
        const __stBody = { name:__sp.name, school:__sp.school, subject:__sp.subject, hint:__stHint, imageBase64:__sp.b64, mimeType:__sp.mime, token:authGet('aiapp_auth_token'), guestId:window.getGuestId() };
        const __stRes = await fetch('/api/tools?action=stamps',{method:'POST',headers:{'Content-Type':'application/json'},signal:genAbortController.signal,body:JSON.stringify(__stBody)});
        const __stData = await __stRes.json().catch(()=>({}));
        if(!__stRes.ok || !__stData.imageBase64){
          thinkingDiv.remove();
          cur.messages.push({role:'assistant',content:(__stData&&__stData.message_ar)||(lang==='ar'?'تعذّر تصميم الطوابع، حاول مجدداً.':'Stamps design failed.')});
        } else {
          thinkingDiv.remove();
          const __stMime = __stData.mimeType||'image/webp';
          cur.lastEditedImage={b64:__stData.imageBase64,mime:__stMime};
          cur.lastMsgWasImageEdit=true;
          cur.messages.push({role:'assistant',content:'',attachments:[{name:'stamps.webp',isImage:true,mime:__stMime,dataUrl:'data:'+__stMime+';base64,'+__stData.imageBase64}]});
        }
      }catch(__e){
        if(__e&&__e.name==='AbortError') return;
        thinkingDiv.remove();
        cur.messages.push({role:'assistant',content:lang==='ar'?'تعذّر تصميم الطوابع، حاول مجدداً.':'Stamps design failed.'});
      }
      renderAll(); saveState();
      return;
    } else if(text && /(?:^|[\s،,.])(طوابع|ملصقات|ستيكرات|استيكرات)/i.test(text) && !cur.adMode && !cur.awaitingAdMode && !__codeWordRe.test(text) && !__IMG_EDIT_VERB_RE.test(text) && !__IMGF_NOT_RE.test(text) && !__adIntentRe.test(text)){
      // 🏷️ v725: طوابع المدرسة — صورة الطفل + اسمه → ورقة طوابع جاهزة للطباعة والقص
      // الصورة: إما مرفقة حالاً (__srcImg) أو آخر صورة معدّلة (cur.lastEditedImage)
      const __stSrcB64   = (__srcImg && __srcImg.dataUrl) ? __srcImg.dataUrl.split(',')[1] : (cur.lastEditedImage && cur.lastEditedImage.b64 ? cur.lastEditedImage.b64 : '');
      const __stSrcMime  = (__srcImg && __srcImg.mime) ? __srcImg.mime : (cur.lastEditedImage && cur.lastEditedImage.mime ? cur.lastEditedImage.mime : 'image/jpeg');
      if(!__stSrcB64){
        cur.messages.push({role:'assistant',content: lang==='ar' ? 'أرفق صورة الطفل أولاً (زر +) ثم اكتب: طوابع باسم فلان 🏷️' : 'Attach the child\'s photo first (+ button), then write: stamps with the name ...'});
        renderAll(); saveState();
        return;
      }
      const __stNameM = text.match(/(?:باسم|بأسم|اسمه|اسمها|اسم|إسم|بي\s*اسم)\s*([^\n.،,؟!]{2,25})/);
      let __stName = __stNameM ? __stNameM[1].trim() : '';
      // 🏫 v729: المدرسة والمادة اختياريتان — «مدرسة كذا» و«مادة كذا»
      const __stSchM = text.match(/(?:مدرسته|مدرستها|مدرسة|مدرسه|المدرسة|المدرسه)\s*[:：]?\s*([^\n.،,؟!]{2,35})/);
      const __stSubM = text.match(/(?:مادته|مادتها|مادة|ماده|المادة|الماده)\s*[:：]?\s*([^\n.،,؟!]{2,25})/);
      let __stSchool = __stSchM ? __stSchM[1].trim() : '';
      let __stSubject = __stSubM ? __stSubM[1].trim() : '';
      // نظّف تداخل الحقول: الاسم قد يبتلع «مدرسة...» أو «مادة...» لأنه يلتقط حتى نهاية الجملة
      const __stCutRe = /\s*(?:و\s*)?(?:مدرسته|مدرستها|مدرسة|مدرسه|المدرسة|المدرسه|مادته|مادتها|مادة|ماده|المادة|الماده)(?=\s|$)[\s\S]*$/;
      __stName = __stName.replace(__stCutRe,'').trim();
      __stSchool = __stSchool.replace(/\s*(?:و\s*)?(?:مادته|مادتها|مادة|ماده|المادة|الماده)(?=\s|$)[\s\S]*$/,'').trim();
      __stSubject = __stSubject.replace(/\s*(?:و\s*)?(?:مدرسته|مدرستها|مدرسة|مدرسه|المدرسة|المدرسه)(?=\s|$)[\s\S]*$/,'').trim();
      if(!/فضاء|كواكب|صاروخ|ديناصور|دايناصور|أميرة|اميرة|برنسيس|ملكة|كرة|كوره|رياضة|رياضه|بحر|سمك|قرش|شاطئ|سيار|سباق|يونيكورن|قوس قزح|حيوان|غابة|باندا|ورد|زهور|فراش|تراث|صقر|روبوت|حلوى|حلويات|كيك|دونات|كلاسيكي|مدرسي كلاسيكي|كرومي|ماي ملدي|ميلودي|هالو كاتي|هيلو كيتي|كيتي|الدبب|دببة|قيمنق|قيمنج|جيمنج|جيمر|بلايستيشن|أنمي|انمي|مانجا|ستريت|سكيت|قرافيتي|جرافيتي|مغامر|طعوس|دباب|اوف رود|أوف رود|أساطير|اساطير|ذئب|تنين|بناتي|استاتيك|اسثتيك|فاشن|موضة|موضه|مكياج|فاجئني|عشوائي/i.test(text)){
        // 🎨 v734: ورقة ثيمات كاملة — overlay picker بدل نص مرقّم
        window.__stPickTheme = window.__stPickTheme || function(){
          return new Promise(function(rs){
            /* v735 (طلب عمران): أقسام بالعمر والجنس — صغار / شباب +12 / بنات */
            var __groups=[
              { t:'👶 للصغار', th:[
                {k:'فضاء',e:'🚀'},{k:'ديناصور',e:'🦖'},{k:'أميرة',e:'👑'},
                {k:'رياضة',e:'⚽'},{k:'بحر',e:'🌊'},{k:'سيارة سباق',e:'🏎️'},
                {k:'يونيكورن',e:'🦄'},{k:'حيوانات',e:'🐼'},{k:'ورود',e:'🌸'},
                {k:'تراث صقر',e:'🦅'},{k:'روبوتات',e:'🤖'},{k:'حلويات',e:'🍩'},
                {k:'فراشات',e:'🦋'},{k:'مدرسي كلاسيكي',e:'📚'},
                {k:'كرومي',e:'🎨'},{k:'ماي ملدي',e:'🐰'},{k:'هالو كاتي',e:'🎀'},{k:'الدببة الثلاثة',e:'🐻'}
              ]},
              { t:'🧑 شباب +12', th:[
                {k:'قيمنق',e:'🎮'},{k:'أنمي',e:'⚔️'},{k:'ستريت',e:'🛹'},
                {k:'مغامرات وطعوس',e:'🏜️'},{k:'أساطير',e:'🐺'}
              ]},
              { t:'🌸 بنات', th:[
                {k:'بناتي راقي',e:'🎀'},{k:'فاشن',e:'👜'}
              ]}
            ];
            var ov=document.createElement('div');
            ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.76);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:12px;';
            var cards='';
            __groups.forEach(function(g){
              cards+='<div style="font-size:12.5px;font-weight:700;color:#c9b3ff;margin:4px 2px 8px;text-align:right;">'+g.t+'</div>'
                +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:13px;">';
              g.th.forEach(function(t){
                cards+='<button class="__stCard" data-k="'+t.k+'" style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:16px;padding:13px 6px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:7px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;">'
                  +'<span style="font-size:34px;line-height:1.1">'+t.e+'</span>'
                  +'<span style="font-size:11px;color:#ddd;font-weight:600;text-align:center;line-height:1.3">'+t.k+'</span>'
                  +'</button>';
              });
              cards+='</div>';
            });
            ov.innerHTML='<div dir="rtl" style="width:100%;max-width:430px;max-height:87vh;overflow-y:auto;background:#18181f;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:18px;color:#fff;font-family:inherit;box-shadow:0 24px 70px rgba(0,0,0,.7);">'
              +'<div style="font-size:17px;font-weight:700;margin-bottom:3px;text-align:center;">🏷️ اختر ثيم الطوابع</div>'
              +'<div style="font-size:12px;opacity:.55;margin-bottom:14px;text-align:center;">اضغط وأبدأ التصميم مباشرة</div>'
              +cards
              +'<button id="__stSurp" style="width:100%;padding:13px;border-radius:14px;border:1px solid rgba(168,130,255,.4);background:rgba(168,130,255,.1);color:#c9b3ff;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:9px;touch-action:manipulation;">✨ فاجئني — اختر لي</button>'
              +'<button id="__stCnc" style="width:100%;padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#777;font-size:13px;cursor:pointer;touch-action:manipulation;">إلغاء</button>'
              +'</div>';
            document.body.appendChild(ov);
            function done(v){try{document.body.removeChild(ov);}catch(_){ /* guard-ok — cleanup, intentional */ }rs(v);}
            ov.querySelectorAll('.__stCard').forEach(function(b){b.onclick=function(){done(b.getAttribute('data-k'));};});
            ov.querySelector('#__stSurp').onclick=function(){done('فاجئني');};
            ov.querySelector('#__stCnc').onclick=function(){done(null);};
            ov.addEventListener('click',function(e){if(e.target===ov)done(null);});
          });
        };
        var __stHint = await window.__stPickTheme();
        if(!__stHint){ thinkingDiv.remove(); renderAll(); saveState(); return; }
        // فاجئني → أرسل hint فارغ عشان السيرفر يختار عشوائياً
        var __stFinalHint = __stHint === 'فاجئني' ? '' : __stHint;
        __showImgLoading(thinkingDiv, 'جارٍ تصميم الطوابع', 'Designing stamps');
        try{
          var __stBodyOv = { name:__stName, school:__stSchool, subject:__stSubject, hint:__stFinalHint, imageBase64:__stSrcB64, mimeType:__stSrcMime, token:authGet('aiapp_auth_token'), guestId:window.getGuestId() };
          var __stResOv = await fetch('/api/tools?action=stamps',{method:'POST',headers:{'Content-Type':'application/json'},signal:genAbortController.signal,body:JSON.stringify(__stBodyOv)});
          var __stDataOv = await __stResOv.json().catch(()=>({}));
          if(!__stResOv.ok || !__stDataOv.imageBase64){
            thinkingDiv.remove();
            cur.messages.push({role:'assistant',content:(__stDataOv&&__stDataOv.message_ar)||(lang==='ar'?'تعذّر تصميم الطوابع، حاول مجدداً.':'Stamps design failed.')});
          } else {
            thinkingDiv.remove();
            var __stMimeOv = __stDataOv.mimeType||'image/webp';
            cur.lastEditedImage={b64:__stDataOv.imageBase64,mime:__stMimeOv};
            cur.lastMsgWasImageEdit=true;
            cur.messages.push({role:'assistant',content:'',attachments:[{name:'stamps.webp',isImage:true,mime:__stMimeOv,dataUrl:'data:'+__stMimeOv+';base64,'+__stDataOv.imageBase64}]});
          }
        }catch(__eOv){
          if(__eOv&&__eOv.name==='AbortError') return;
          thinkingDiv.remove();
          cur.messages.push({role:'assistant',content:lang==='ar'?'تعذّر تصميم الطوابع، حاول مجدداً.':'Stamps design failed.'});
        }
        renderAll(); saveState();
        return;
      }
      __showImgLoading(thinkingDiv, 'جارٍ تصميم الطوابع', 'Designing stamps');
      try{
        const __stBody = { name:__stName, school:__stSchool, subject:__stSubject, hint:text, imageBase64:__stSrcB64, mimeType:__stSrcMime, token:authGet('aiapp_auth_token'), guestId:window.getGuestId() };
        const __stRes = await fetch('/api/tools?action=stamps',{method:'POST',headers:{'Content-Type':'application/json'},signal:genAbortController.signal,body:JSON.stringify(__stBody)});
        const __stData = await __stRes.json().catch(()=>({}));
        if(!__stRes.ok || !__stData.imageBase64){
          thinkingDiv.remove();
          cur.messages.push({role:'assistant',content:(__stData&&__stData.message_ar)||(lang==='ar'?'تعذّر تصميم الطوابع، حاول مجدداً.':'Stamps design failed.')});
        } else {
          thinkingDiv.remove();
          const __stMime = __stData.mimeType||'image/webp';
          cur.lastEditedImage={b64:__stData.imageBase64,mime:__stMime};
          cur.lastMsgWasImageEdit=true;
          cur.messages.push({role:'assistant',content:'',attachments:[{name:'stamps.webp',isImage:true,mime:__stMime,dataUrl:'data:'+__stMime+';base64,'+__stData.imageBase64}]});
        }
      }catch(__e){
        if(__e&&__e.name==='AbortError') return;
        thinkingDiv.remove();
        cur.messages.push({role:'assistant',content:lang==='ar'?'تعذّر تصميم الطوابع، حاول مجدداً.':'Stamps design failed.'});
      }
      renderAll(); saveState();
      return;
    } else if(text && __adIntentRe.test(text) && !cur.adMode && !cur.awaitingAdMode && !__codeWordRe.test(text) && !/(داخل|خارج)/i.test(text)){
      // v695: إعلان → /api/tools?action=adimage (gpt-image-2) بجودة احترافية حقيقية
      const __wM  = text.match(/(?:مطلوب|السعر|ب\s*(?:فقط)?)\s*([\d,،\s]+(?:الف|ألف|k)?)/i);
      const __mmM = text.match(/(?:الممشى|ممشى)\s*([\d,،\s]+(?:الف|ألف|k)?)/i);
      const __yrM = text.match(/(?:موديل|سنة|عام|model|year)\s*(\d{4})/i);
      const __phM = text.match(/((?:\+971|\+966|\+965|\+973|\+968|\+974|05|00966|00971)\d[\d\s\-]{6,})/);
      let __clnTitle = text.replace(/\n[\s\S]*/,'').replace(/(إعلان|اعلان|لل?بيع|لي\s*البيع|للإيجار|مطلوب[\s\d,،الفk]*|السعر[\s\d,،الفk]*|الممشى[\s\d,،الفk]*(?:كم)?|ممشى[\s\d,،الفk]*(?:كم)?|موديل\s*\d+|سنة\s*\d+|عام\s*\d+|رقم\s*(?:ال)?توا\S*|للتواصل|اتصل\s*(?:على)?|جوال|هاتف|واتساب|(?:\+?\d[\d\s\-]{6,})|المعاين[ةه][^\n]{0,40}|قابل\s*لل?تفاوض|خليجي|المكينة\s*نظيفة|نظيفة?|عدد\s*الغرف\s*\d*|\d+\s*غرف|دورات\s*(?:ال)?مياه\s*\d*|\d+\s*دورات\s*(?:ال)?مياه|مع\s*مجلس|ومجلس|مجلس|مع\s*مسبح|ومسبح|مسبح)\s*/gi,' ').replace(/[.،,:]+/g,' ').replace(/\s{2,}/g,' ').replace(/(?:^|\s)(مع|و|في)\s*$/,'').trim();
      if(__clnTitle.length>40){ __clnTitle = __clnTitle.slice(0,40).replace(/\s\S*$/,''); }
      const __adTitle = __clnTitle || (lang==='ar'?'للبيع':'For Sale');
      const __adPrice = __wM ? __wM[1].trim() : '';
      const __adPhone = __phM ? __phM[0].replace(/[\s\-]/g,'') : '';
      const __rmM = text.match(/(?:عدد\s*الغرف|الغرف)\s*(\d+)|(\d+)\s*غرف/);
      const __wcM = text.match(/(\d+)?\s*دورات\s*(?:ال)?مياه\s*(\d+)?/);
      const __adChips = [__yrM?('الموديل '+__yrM[1]):'', __mmM?('المسافة المقطوعة '+__mmM[1].trim()+' كم'):'', /خليجي/.test(text)?'المواصفات خليجي':'', /نظيف/.test(text)?'المكينة نظيفة':'', __rmM?('الغرف '+(__rmM[1]||__rmM[2])):'', __wcM?('دورات المياه'+((__wcM[1]||__wcM[2])?(' '+(__wcM[1]||__wcM[2])):'')):'', /مجلس/.test(text)?'مجلس':'', /مسبح/.test(text)?'مسبح':''].filter(Boolean).slice(0,5);
      const __adSpecs = '';
      const __adKick  = /(إيجار|للإيجار)/i.test(text)?'للإيجار': (/مطلوب/i.test(text) && !/مطلوب\s*[\d٠-٩]/.test(text))?'مطلوب':'للبيع';
      const __adLook  = /(شقة|شقه|فيلا|عقار|بيت|منزل|أرض|ارض)/i.test(text)?'royal': /(جوال|ايفون|سامسونج)/i.test(text)?'minimal':'neon';
      // صورة المستخدم إذا أرفق واحدة
      const __adUserB64 = (__srcImg && cur.lastEditedImage && cur.lastEditedImage.b64) ? cur.lastEditedImage.b64 : null;
      const __adUserMime= (__srcImg && cur.lastEditedImage && cur.lastEditedImage.mime) ? cur.lastEditedImage.mime : 'image/jpeg';
      // v705: نفس بطاقة توليد الصور الرمادية (نقاط تتنفس) — طلب عمران «اريد نفس هذي»
      window.__adProgressTimer = null;
      __showImgLoading(thinkingDiv, 'جارٍ إنشاء الصورة', 'Generating image');
      try{
        const __adCat = /(سكن\s*عمال|غرف\s*عمال|معسكر\s*(?:عمال|سكن)|worker\s*housing|labou?r\s*camp)/i.test(text)?'worker'
          : /(صيدل|دواء|أدوية|توصيل\s*(?:دواء|صيدل)|pharmacy|medicine\s*delivery)/i.test(text)?'pharmacy'
          : /(شقة|شقه|فيلا|عقار|بيت|منزل|أرض|ارض)/i.test(text)?'estate'
          : /(سيارة|سياره|لاندكروزر|تويوتا|نيسان|جيب|باترول|لكزس|مرسيدس|بي ام|موتر)/i.test(text)?'car':'other';
        const __adNote = /(تفاوض|قابل للتفاوض)/i.test(text)?'قابل للتفاوض':'';
        const __ftM = text.match(/(المعاين[ةه][^\n.،,]{0,30})/);
        const __adFoot = __ftM ? __ftM[1].trim() : '';
        const __bgM = text.match(/(?:غير|غيّر|بدل|بدّل|اجعل|خل|خلي|خلّي|مع|ب)?\s*(?:ال)?خلفي[ةه]\s*[:\-]?\s*([^\n.،,؟!]{2,60})/);
        const __adBg = __bgM ? __bgM[1].trim() : '';
        const __adBody = { title:__adTitle, spec:__adSpecs, kick:__adKick, price:__adPrice, unit:'درهم', tel:__adPhone, look:__adLook, ac:'#FFD700', ratio:'square', lang:'ar', chips:__adChips, note:__adNote, foot:__adFoot, cat:__adCat, bg:__adBg, token:authGet('aiapp_auth_token'), guestId:window.getGuestId() };
        if(__adUserB64){ __adBody.imageBase64=__adUserB64; __adBody.mimeType=__adUserMime; }
        const __adRes = await fetch('/api/tools?action=adimage',{method:'POST',headers:{'Content-Type':'application/json'},signal:genAbortController.signal,body:JSON.stringify(__adBody)});
        const __adData = await __adRes.json().catch(()=>({}));
        clearInterval(window.__adProgressTimer);
        if(!__adRes.ok || !__adData.imageBase64){
          const __errMsg = __adData.message_ar || __adData.error || 'خطأ غير معروف';
          thinkingDiv.remove(); cur.adMode=null;
          cur.messages.push({role:'assistant',content:lang==='ar'?('تعذّر تصميم الإعلان: '+__errMsg):'Ad design failed: '+__errMsg});
        } else {
          thinkingDiv.remove();
          const __adMime2 = __adData.mimeType||'image/webp';
          cur.lastEditedImage={b64:__adData.imageBase64,mime:__adMime2};
          cur.lastMsgWasImageEdit=true; cur.adMode=null;
          cur.messages.push({role:'assistant',content:'',attachments:[{name:'ad.webp',isImage:true,mime:__adMime2,dataUrl:'data:'+__adMime2+';base64,'+__adData.imageBase64}]});
        }
      }catch(__e){
        clearInterval(window.__adProgressTimer);
        if(__e&&__e.name==='AbortError') return;
        thinkingDiv.remove(); cur.adMode=null;
        cur.messages.push({role:'assistant',content:lang==='ar'?'تعذّر تصميم الإعلان، حاول مجدداً.':'Ad design failed.'});
      }
      renderAll(); saveState();
      return;
    } else if(text && (__srcImg || __followUp) && /(لوجو|شعار|logo|أيقون|ايقون|صمم|صمّم|تصميم|بطاقة|دعوة|بوستر|غلاف|بنر|نفس هذ|design)/i.test(text) && !cur.adMode && !cur.awaitingAdMode && text.indexOf('ملاحظة للنظام') === -1 && !(text.length <= 300 && !__codeWordRe.test(text) && !__ATT_VISION_RE.test(text) && !__nanoQ.test(text))){
      // نمط نانو: رسالة قصيرة مع صورة (مرفقة أو من الذاكرة) بلا كلمة كود = تعديل صورة، لا تُطوَّل بملاحظة النظام حتى لا تُحرَم من مسار الصور.
      // 🎨 v328: صورة/شعار مرفق + طلب تصميم → صورة المستخدم تُضمَّن كما هي — ممنوع إعادة رسمها
      text += '\n(ملاحظة للنظام: المستخدم أرفق صورة/شعارًا — إذا كان ردك تصميمًا أو كودًا يجب استخدام صورته نفسها كما هي عبر src="__USER_IMAGE__" أو background-image:url(\'__USER_IMAGE__\') بالضبط، والتطبيق يستبدلها بالصورة الحقيقية تلقائيًا. ممنوع منعًا باتًا استبدال صورة المستخدم بلوجو أو صورة من تصميمك أو من الإنترنت — صورة المستخدم هي الأصل الرسمي وتظهر بدون أي تشويه أو قلب أو قص)';
    }
    // 🖼️ صورة مرفقة بدون أي نص → v716: إذا للمحادثة سياق واضح نحلّلها مباشرة، وإلا نسأل محليًا
    if(__srcImg && !(text || '').trim()){
      cur.lastEditedImage = { b64: (__srcImg.dataUrl || '').split(',')[1] || '', mime: __srcImg.mime || 'image/png' };
      cur.lastMsgWasImageEdit = true;
      // v716: «وصلتني الصورة 👍 شو تبي أسوي فيها؟» كانت تُقال حتى لو المستخدم أرسل الصورة
      // استجابةً لطلب صريح في المحادثة (مثال: «أرسل لقطة شاشة لأحدد السبب»). الآن:
      // إذا في المحادثة رسائل نصية حديثة ذات معنى → نمرّر الصورة للنموذج مع تعليمة
      // أن يحلّلها في ضوء السياق مباشرة. السؤال المحلي يبقى فقط للمحادثة بلا سياق.
      var __imgCtx = (cur.messages || []).slice(-6).filter(function(m){
        return m && typeof m.content === 'string' && m.content.trim().length >= 12
          && m.content.indexOf('وصلتني الصورة') === -1 && m.content.indexOf('Got the image') === -1;
      });
      if(__imgCtx.length){
        text = (lang === 'ar')
          ? '(ملاحظة للنظام: المستخدم أرفق صورة استكمالًا لسياق المحادثة أعلاه — حلّل الصورة مباشرة واربطها بآخر موضوع في المحادثة ورُدّ بجواب عملي، ولا تسأل المستخدم ماذا يريد أن يفعل بها)'
          : '(System note: the user attached an image continuing the conversation above — analyze it directly in that context and give a practical answer; do not ask what they want to do with it)';
      } else {
        cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? 'وصلتني الصورة 👍 شو تبي أسوي فيها؟' : 'Got the image 👍 What would you like to do with it?') });
        renderAll(); saveState();
        return;
      }
    }
    // 🎬 v363: شخصية كرتونية تتكلم من الدردشة مباشرة — صورة → كرتون (Gemini) → فيديو ناطق (Runway)
    let __charImg = __srcImg
      ? { b64: (__srcImg.dataUrl || '').split(',')[1] || '', mime: __srcImg.mime || 'image/png' }
      : (cur.lastEditedImage ? { b64: cur.lastEditedImage.b64, mime: cur.lastEditedImage.mime || 'image/png' } : null);
    const __talkCharRe = /(شخصية|شخصيه|كرتون|كارتون|كرتوني|كرتونية|كارتونية|character|cartoon|avatar|أفتار|افتار)/i;
    const __speakRe = /(تتكلم|يتكلم|تحكي|يحكي|تتحدث|يتحدث|ناطق|ناطقة|يقول|تقول|talk|talking|speak|speaking|say)/i;
    const __talkCharIntent = !!text && !__codeWordRe.test(text) && __talkCharRe.test(text) && __speakRe.test(text);
    let __alreadyCartoon = false;
    // 🎬 v367: طلب شخصية تتكلم بدون صورة مرفقة → افتح مكتبة شخصيات جاهزة يختار منها (أو يرفع صورته)
    window.pickTalkCharacter = window.pickTalkCharacter || function(isAr){
      return new Promise(function(resolve){
        const chars = [
          {id:'c1', name:(isAr?'شاب إماراتي':'Emirati man')},
          {id:'c2', name:(isAr?'فتاة إماراتية':'Emirati woman')},
          {id:'c3', name:(isAr?'روبوت':'Robot')},
          {id:'c4', name:(isAr?'ولد':'Boy')},
          {id:'c5', name:(isAr?'بنت':'Girl')},
          {id:'c6', name:(isAr?'جدّ':'Grandpa')}
        ];
        const ov = document.createElement('div');
        ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px;';
        const dir=isAr?'rtl':'ltr';
        let grid='';
        chars.forEach(function(c){
          grid += '<button class="__pcItem" data-id="'+c.id+'" style="border:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:14px;padding:6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;">'
            + '<img src="/assets/characters/'+c.id+'.png" style="width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:10px;background:#111;" loading="lazy">'
            + '<span style="font-size:11.5px;color:#ddd;">'+c.name+'</span></button>';
        });
        ov.innerHTML='<div dir="'+dir+'" style="width:100%;max-width:380px;max-height:88vh;overflow:auto;background:#1c1c24;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;color:#fff;font-family:inherit;box-shadow:0 18px 50px rgba(0,0,0,.5);">'
          + '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">'+(isAr?'اختر شخصية تتكلم 🎭':'Pick a talking character 🎭')+'</div>'
          + '<div style="font-size:12px;opacity:.7;margin-bottom:14px;">'+(isAr?'اختر شخصية جاهزة، أو ارفع صورتك.':'Pick a ready character, or upload your photo.')+'</div>'
          + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">'+grid+'</div>'
          + '<button id="__pcUpload" style="width:100%;padding:11px;border-radius:12px;border:1px dashed rgba(168,130,255,.5);background:rgba(168,130,255,.08);color:#c9b3ff;font-size:12.5px;cursor:pointer;margin-bottom:10px;">'+(isAr?'📎 أو ارفع صورتك بدل ذلك':'📎 Or upload your own photo')+'</button>'
          + '<button id="__pcCancel" style="width:100%;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:#aaa;font-size:13px;cursor:pointer;">'+(isAr?'إلغاء':'Cancel')+'</button>'
          + '</div>';
        document.body.appendChild(ov);
        function done(v){ try{document.body.removeChild(ov);}catch(_){ __swallow(_, "misc:app-09-attach#15"); }; resolve(v); }
        ov.querySelectorAll('.__pcItem').forEach(function(b){ b.onclick=function(){ done({id:b.getAttribute('data-id')}); }; });
        ov.querySelector('#__pcUpload').onclick=function(){ done('upload'); };
        ov.querySelector('#__pcCancel').onclick=function(){ done(null); };
        ov.addEventListener('click', function(e){ if(e.target===ov) done(null); });
      });
    };
    if(__talkCharIntent && !(__charImg && __charImg.b64)){
      const __pick = await window.pickTalkCharacter(lang==='ar');
      if(__pick === null){ thinkingDiv && thinkingDiv.remove(); return; }
      if(__pick === 'upload'){
        cur.messages.push({ role:'assistant', content:(lang==='ar'?'📎 ارفع صورتك من زر المشبك ثم أعد نفس الطلب مع الجملة اللي تبي الشخصية تقولها.':'📎 Attach your photo, then resend the same request with the line you want the character to say.') });
        thinkingDiv && thinkingDiv.remove(); renderAll(); saveState(); return;
      }
      try{
        const __pr = await fetch('/assets/characters/'+__pick.id+'.png');
        const __pb = await __pr.blob();
        const __pd = await new Promise(function(res){ const fr=new FileReader(); fr.onload=function(){res(fr.result);}; fr.readAsDataURL(__pb); });
        __charImg = { b64: (String(__pd).split(',')[1]||''), mime:'image/png' };
        __alreadyCartoon = true;
      }catch(_){ thinkingDiv && thinkingDiv.remove(); cur.messages.push({ role:'assistant', content:(lang==='ar'?'⚠️ تعذّر تحميل الشخصية، جرّب مرة ثانية.':'⚠️ Could not load the character, try again.') }); renderAll(); saveState(); return; }
    }
    const __wantsTalkChar = __talkCharIntent && !!(__charImg && __charImg.b64);
    if(__wantsTalkChar){
      let __dialogue = '';
      const __dm = text.match(/(?:يقول|تقول|قول(?:ي|ه|ها)?|says?|:|：)\s*[:：]?\s*(.+)$/i);
      if(__dm && __dm[1]) __dialogue = __dm[1].trim().replace(/^["'«»\s]+|["'«»\s]+$/g,'');
      // 🎬 v366: نافذة سؤالين سريعة عشان المستخدم يكون على بيّنة — حركة الشخصية + مدة الفيديو
      window.askTalkCharOpts = window.askTalkCharOpts || function(isAr){
        return new Promise(function(resolve){
          const ov = document.createElement('div');
          ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px;';
          const dir = isAr ? 'rtl' : 'ltr';
          ov.innerHTML = '<div dir="'+dir+'" style="width:100%;max-width:340px;background:#1c1c24;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:20px;color:#fff;font-family:inherit;box-shadow:0 18px 50px rgba(0,0,0,.5);">'
            + '<div style="font-size:16px;font-weight:700;margin-bottom:14px;">'+(isAr?'إعدادات الشخصية المتكلمة 🎬':'Talking character options 🎬')+'</div>'
            + '<div style="font-size:13px;opacity:.75;margin-bottom:8px;">'+(isAr?'حركة الشخصية:':'Character motion:')+'</div>'
            + '<div id="__tcMotion" style="display:flex;gap:8px;margin-bottom:16px;">'
            +   '<button data-v="static" class="__tcOpt" style="flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;font-size:13px;cursor:pointer;">'+(isAr?'ثابتة (تتكلم فقط)':'Static (talk only)')+'</button>'
            +   '<button data-v="moving" class="__tcOpt" style="flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;font-size:13px;cursor:pointer;">'+(isAr?'متحركة':'Moving')+'</button>'
            + '</div>'
            + '<div style="font-size:13px;opacity:.75;margin-bottom:8px;">'+(isAr?'مدة الفيديو:':'Video duration:')+'</div>'
            + '<div id="__tcDur" style="display:flex;gap:8px;margin-bottom:16px;">'
            +   '<button data-v="4" class="__tcD" style="flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;font-size:13px;cursor:pointer;">'+(isAr?'٤ ثواني':'4s')+'</button>'
            +   '<button data-v="6" class="__tcD" style="flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;font-size:13px;cursor:pointer;">'+(isAr?'٦ ثواني':'6s')+'</button>'
            +   '<button data-v="8" class="__tcD" style="flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;font-size:13px;cursor:pointer;">'+(isAr?'٨ ثواني':'8s')+'</button>'
            + '</div>'
            + '<button data-v="more" id="__tcMore" style="width:100%;padding:10px;border-radius:12px;border:1px dashed rgba(168,130,255,.5);background:rgba(168,130,255,.08);color:#c9b3ff;font-size:12.5px;cursor:pointer;margin-bottom:14px;">'+(isAr?'أبي فيديو أطول / أكثر ✨':'I want a longer / more video ✨')+'</button>'
            + '<div style="display:flex;gap:8px;">'
            +   '<button id="__tcCancel" style="flex:1;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:transparent;color:#aaa;font-size:13px;cursor:pointer;">'+(isAr?'إلغاء':'Cancel')+'</button>'
            +   '<button id="__tcGo" style="flex:2;padding:11px;border-radius:12px;border:none;background:linear-gradient(135deg,#6b7280,#4b5563);color:#fff;font-weight:700;font-size:13px;cursor:pointer;">'+(isAr?'ابدأ 🎬':'Start 🎬')+'</button>'
            + '</div></div>';
          document.body.appendChild(ov);
          let motion = 'moving', dur = 6;
          function paint(){
            ov.querySelectorAll('.__tcOpt').forEach(b=>{ b.style.background = b.getAttribute('data-v')===motion ? 'linear-gradient(135deg,#6b7280,#4b5563)' : 'rgba(255,255,255,.05)'; b.style.borderColor = b.getAttribute('data-v')===motion ? 'transparent' : 'rgba(255,255,255,.15)'; });
            ov.querySelectorAll('.__tcD').forEach(b=>{ b.style.background = parseInt(b.getAttribute('data-v'),10)===dur ? 'linear-gradient(135deg,#6b7280,#4b5563)' : 'rgba(255,255,255,.05)'; b.style.borderColor = parseInt(b.getAttribute('data-v'),10)===dur ? 'transparent' : 'rgba(255,255,255,.15)'; });
          }
          paint();
          ov.querySelectorAll('.__tcOpt').forEach(b=> b.onclick = ()=>{ motion = b.getAttribute('data-v'); paint(); });
          ov.querySelectorAll('.__tcD').forEach(b=> b.onclick = ()=>{ dur = parseInt(b.getAttribute('data-v'),10); paint(); });
          function done(val){ try{ document.body.removeChild(ov); }catch(_){ __swallow(_, "misc:app-09-attach#16"); } resolve(val); }
          ov.querySelector('#__tcMore').onclick = ()=> done('more');
          ov.querySelector('#__tcCancel').onclick = ()=> done(null);
          ov.querySelector('#__tcGo').onclick = ()=> done({ motion, duration: dur });
          ov.addEventListener('click', e=>{ if(e.target===ov) done(null); });
        });
      };
      const __tcChoice = await window.askTalkCharOpts(lang==='ar');
      if(__tcChoice === null){ thinkingDiv && thinkingDiv.remove(); return; }
      if(__tcChoice === 'more'){
        cur.messages.push({ role:'assistant', content:(lang==='ar'?'✨ الفيديوهات الأطول والخيارات الإضافية متاحة في الباقات المدفوعة — افتح ⚙️ ← الاشتراك لترقية باقتك وتطلّع فيديوهات أطول بجودة أعلى.':'✨ Longer videos and extra options are available on paid plans — open ⚙️ → Subscription to upgrade and create longer, higher-quality videos.') });
        thinkingDiv && thinkingDiv.remove(); renderAll(); saveState(); return;
      }
      const __tcMotion = __tcChoice.motion, __tcDur = __tcChoice.duration;
      try{
        let __cartoonB64 = '', __cartoonMime = 'image/png';
        if(__alreadyCartoon){
          // الشخصية الجاهزة كرتونية أصلًا — نستخدمها مباشرة بدون تحويل
          __cartoonB64 = __charImg.b64; __cartoonMime = __charImg.mime || 'image/png';
        } else {
          // ① تحويل الصورة لشخصية كرتونية عبر Gemini
          chatPhase('🎨', lang === 'ar' ? 'جاري تحويل صورتك لشخصية كرتونية…' : 'Turning your photo into a cartoon character…', thinkingDiv);
          const __cartoonPrompt = 'Transform this photo into a cute chibi-style 3D animated character: big adorable head, small short body, FULL BODY standing pose facing the camera, happy friendly expression, clean modern Pixar-like rendering. Keep the SAME face features, hairstyle, beard/facial hair, skin tone and the same clothing style and colors as the person in the photo (including traditional dress if worn). Soft simple pastel studio background, vertical 9:16 composition with the whole character visible from head to feet.';
          for(let __ct = 0; __ct < 2 && !__cartoonB64; __ct++){
            if(__ct) await new Promise(r=>setTimeout(r,1500));
            const __cr = await fetch('/api/maha-image', {
              method:'POST', headers:{'Content-Type':'application/json'}, signal: genAbortController.signal,
              body: JSON.stringify({ prompt: __cartoonPrompt, editImageBase64: __charImg.b64, editMimeType: __charImg.mime, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() })
            });
            const __cd = await __cr.json().catch(()=>({}));
            if(__cr.ok && __cd.imageBase64){ __cartoonB64 = __cd.imageBase64; __cartoonMime = __cd.mimeType || 'image/png'; }
          }
          if(!__cartoonB64) throw new Error(lang==='ar'?'تعذر تحويل الصورة لكرتون، جرّب صورة أوضح.':'Could not cartoonize the image, try a clearer photo.');
          cur.messages.push({ role:'assistant', content:(lang==='ar'?'🎨 صارت شخصية كرتونية ✅ الحين أحرّكها تتكلم…':'🎨 Cartoon character ready ✅ now animating it to talk…'), attachments:[{ name:'cartoon.png', isImage:true, mime:__cartoonMime, dataUrl:'data:'+__cartoonMime+';base64,'+__cartoonB64 }] });
          cur.lastEditedImage = { b64: __cartoonB64, mime: __cartoonMime };
        }
        // ② تحريكها لفيديو ناطق بصوت مسموع عبر Veo 3 (image-to-video + صوت أصلي)
        //    Runway يطلّع فيديو صامت، فالصوت المنطوق يحتاج Veo 3 — عمودي 9:16.
        chatPhase('🎬', lang === 'ar' ? 'جاري تحريك الشخصية لتتكلم بصوت… قد يستغرق ١–٣ دقائق' : 'Animating the character to talk with voice… 1–3 minutes', thinkingDiv);
        const __voiceLang = /[\u0600-\u06FF]/.test((__dialogue || '') + ' ' + (text || '')) ? 'Arabic' : 'the same language as the line';
        const __motionDesc = __tcMotion === 'static'
          ? 'The character stands still in place, only the head and mouth move naturally while talking (minimal body motion)'
          : 'The character is lively and animated: gentle body movement, waving hand gestures and expressive motion while talking';
        const __talkPrompt = 'A cute chibi 3D cartoon character standing and talking directly to the camera, with natural mouth movement and accurate lip-sync, lively friendly facial expression. ' + __motionDesc + '. The character speaks out loud in ' + __voiceLang + (__dialogue ? (', clearly saying: "' + __dialogue.slice(0,300) + '"') : '') + '. Clear spoken voice audio, no background music. Keep the character exactly as in the provided image.';
        const __vp = { promptText: __talkPrompt.slice(0,1400), ratio: '720:1280', quality: 'fast', durationSeconds: __tcDur, token: authGet('aiapp_auth_token'), imageBase64: __cartoonB64, imageMime: __cartoonMime };
        let __op = null, __verr = '';
        for(let __a = 0; __a < 2 && !__op; __a++){
          const __r = await fetch('/api/video?action=veo-create', { method:'POST', headers:{'Content-Type':'application/json'}, signal: genAbortController.signal, body: JSON.stringify(__vp) });
          const __d = await __r.json().catch(()=>({}));
          if(__r.ok && __d.op){ __op = __d.op; }
          else { __verr = (__d && __d.error) || ('HTTP ' + __r.status); if(/auth_required/.test(__verr) || /points_insufficient/.test(__verr)) break; if(__a === 0) await new Promise(r=>setTimeout(r,6000)); }
        }
        if(!__op){
          if(/auth_required/.test(__verr)) throw new Error(lang==='ar'?'سجّل الدخول أولًا عشان أسوي لك الفيديو.':'Please log in first to create videos.');
          if(/points_insufficient/.test(__verr)) throw new Error(lang==='ar'?'رصيدك غير كافٍ لإنشاء فيديو ناطق.':'Not enough balance for a talking video.');
          throw new Error(__verr);
        }
        let __vurl = null; const __vt0 = Date.now();
        while(!__vurl){
          if(Date.now() - __vt0 > 6*60*1000) throw new Error(lang==='ar'?'تأخر إنشاء الفيديو، جرّب مرة ثانية.':'Video generation timed out, please try again.');
          await new Promise(r=>setTimeout(r,6000));
          if(genAbortController.signal.aborted) throw Object.assign(new Error('aborted'), { name:'AbortError' });
          const __sr = await fetch('/api/video?action=veo-status&op=' + encodeURIComponent(__op), { signal: genAbortController.signal });
          const __sd = await __sr.json().catch(()=>({}));
          if(__sd.status === 'SUCCEEDED'){ __vurl = Array.isArray(__sd.output) ? __sd.output[0] : __sd.output; }
          else if(__sd.status === 'FAILED'){ let __fr = __sd.failure || ''; if(/moderation|SAFETY|filtered|content did not pass/i.test(__fr)){ __fr = (lang==='ar')?'الرقابة رفضت المحتوى — جرّب صورة ثانية':'Content rejected by safety filters — try another photo'; } throw new Error((lang==='ar'?'فشل إنشاء الفيديو':'Video generation failed') + (__fr?(' — '+__fr):'')); }
          else { chatPhase('🎬', (lang==='ar'?'جاري تحريك الشخصية بصوت… ':'Animating with voice… ') + (__sd.status || ''), thinkingDiv); }
        }
        cur.messages.push({ role:'assistant', content:(lang==='ar'?'🎬 شخصيتك الكرتونية تتكلم بصوت جاهزة ✅ (الرابط صالح ٢٤ ساعة — نزّله عشان يظل عندك)':'🎬 Your talking cartoon character (with voice) is ready ✅ (link valid 24h — download it to keep it)'), attachments:[{ name:'talking-character.mp4', isVideo:true, url:__vurl }] });
        if(window.autoSaveVideo) window.autoSaveVideo(__vurl);
      }catch(e){
        if(!(e && e.name === 'AbortError')){ cur.messages.push({ role:'assistant', content:'⚠️ ' + __friendlyErr(e) }); }
      }
      cur.lastMsgWasImageEdit = false;
      renderAll(); saveState();
      return;
    }
    // 🏠 طلب توليد صورة جديدة انطلاقًا من صورة مرفقة (مثال: مخطط منزل + "عطني تصميم خارجي")
    const __imgGenIntentRe = /^\s*صور[هة]\s+\S|(?:^|[\s.,،!؟?])(?:صوّر|صور|صوره|صورة|تصور)\s?لي\s+\S|(عطني|أعطني|اعطني|هات|ابا|أبا|ابي|أبي|ابغي|أبغي|اريد|أريد|سو|سوي|سوّي|اعمل|أعمل|give me|make me|i want|show me)\s+(?:لي\s+)?.{0,20}?(تصميم|تصور|منظر|واجهة|صوره?|رسمة|شكل|design|render|view|image|picture|visual)/i;
    // 🎬 فيديو من المحادثة مباشرة: صورة + "سوي فيديو/حركها" → Runway image_to_video،
    // وبدون صورة مع طلب فيديو صريح → text_to_video. (كل الأقسام في مكان واحد)
    const __videoWordRe = /فيديو|ڤيديو|\bvideo\b/i;
    const __animateRe = /(حرك|حرّك|animate)/i;
    const __vidSrc = __srcImg
      ? { b64: (__srcImg.dataUrl || '').split(',')[1] || '', mime: __srcImg.mime || 'image/png' }
      : (cur.lastEditedImage ? { b64: cur.lastEditedImage.b64, mime: cur.lastEditedImage.mime || 'image/png' } : null);
    const __wantsVideo = !!text && !__codeWordRe.test(text) && (
      (__videoWordRe.test(text) && (__routeCmdRe.test(text) || /(حول|حوّل|حوله|حوّله|ولد|ولّد|انتج|أنتج|اطلع لي|طلع لي|generate|convert|turn)/i.test(text) || /(فيديو|ڤيديو|video)\s+(عن|يظهر|فيه|about|of|showing)\s+\S/i.test(text))) ||
      (!!__vidSrc && (__srcImg || cur.lastMsgWasImageEdit) && __animateRe.test(text))
    );
    // v204: a request like just "اريد فيديو" / "سوي فيديو" (no actual subject)
    // used to fall straight into real Runway/Veo generation — burning credits
    // on a random default scene. Strip the trigger words/pronouns/punctuation
    // and require at least 2 remaining meaningful words before generating;
    // otherwise ask what the video/image should be about instead of calling
    // the generation API. Only applies to the text_to_video path (no source
    // image) — when an image is attached/animated, the image itself is the
    // subject, so this check is skipped for that flow.
    const __mediaTriggerWordsRe = /[؟?!.,،؛:]|\b(اريد|أريد|ابي|أبي|ابغى|ابغي|أبغى|أبغي|ابا|أبا|سوي|سوّي|سو|اعمل|أعمل|اصنع|أصنع|انشئ|أنشئ|اعطني|أعطني|عطني|هات|لي|لى|إلي|الي|انا|أنا|فيديو|ڤيديو|video|صورة|image|picture|مقطع|clip|من فضلك|please|لو سمحت)\b/gi;
    function __isVagueMediaRequest(raw){
      const core = String(raw || '').replace(__mediaTriggerWordsRe, ' ').replace(/\s+/g, ' ').trim();
      if(!core) return true;
      return core.split(' ').filter(Boolean).length < 2;
    }
    const __videoHasConcreteSubject = !!(__vidSrc && (__srcImg || cur.lastMsgWasImageEdit) && __animateRe.test(text || ''));
    if(__wantsVideo && !__videoHasConcreteSubject && __isVagueMediaRequest(text)){
      cur.messages.push({ role: 'assistant', content: lang === 'ar' ? 'فيديو عن شو؟ وصفلي المشهد اللي تبيه 🎬' : 'A video about what? Describe the scene you want 🎬' });
      renderAll(); saveState();
      thinkingDiv && thinkingDiv.remove();
      return;
    }
    if(__wantsVideo){
      chatPhase('🎬', lang === 'ar' ? 'جاري إنشاء الفيديو… قد يستغرق ١–٣ دقائق' : 'Creating video… this can take 1–3 minutes', thinkingDiv);
      try{
        const __vp = { promptText: text.slice(0, 900), duration: 5, ratio: '1280:720', token: authGet('aiapp_auth_token') };
        if(__vidSrc && __vidSrc.b64 && (__srcImg || __animateRe.test(text) || /منها|عليها|الصورة|صورتي|this image|the image|it/i.test(text))){
          // Runway requires w/h ratio 0.5–2: pad the image if needed
          try{
            const __fixed = await new Promise((resolve) => {
              const __im = new Image();
              __im.onload = () => {
                const __r2 = __im.width / __im.height;
                if(__r2 >= 0.5 && __r2 <= 2) return resolve(null);
                let __cw = __im.width, __ch = __im.height;
                if(__r2 < 0.5) __cw = Math.ceil(__im.height * 0.52); else __ch = Math.ceil(__im.width * 0.52);
                const __c = document.createElement('canvas');
                __c.width = __cw; __c.height = __ch;
                const __x = __c.getContext('2d');
                __x.fillStyle = '#000'; __x.fillRect(0, 0, __cw, __ch);
                __x.drawImage(__im, Math.round((__cw - __im.width) / 2), Math.round((__ch - __im.height) / 2));
                resolve(__c.toDataURL('image/jpeg', 0.85).split(',')[1]);
              };
              __im.onerror = () => resolve(null);
              __im.src = 'data:' + (__vidSrc.mime || 'image/png') + ';base64,' + __vidSrc.b64;
            });
            if(__fixed){ __vidSrc.b64 = __fixed; __vidSrc.mime = 'image/jpeg'; }
          }catch(e){ __swallow(e, "misc:app-09-attach#17"); }
          __vp.imageBase64 = __vidSrc.b64;
          __vp.imageMime = __vidSrc.mime;
        }
        let __vid = null, __verr = '';
        for(let __a = 0; __a < 2 && !__vid; __a++){
          // v405: postWithConfirm يتعامل مع 428 confirm_required (تأكيد التكلفة) بدل خطأ خام
          const __r = await postWithConfirm('/api/video-create', __vp);
          const __d = await __r.json().catch(() => ({}));
          if(__r.ok && __d.id){ __vid = __d.id; }
          else {
            __verr = (__d && __d.error) || ('HTTP ' + __r.status);
            if(__verr === 'auth_required' || __verr === 'daily_limit_reached') break;
            if(__a === 0) await new Promise(r => setTimeout(r, 6000));
          }
        }
        if(!__vid){
          if(__verr === 'auth_required') throw new Error(lang === 'ar' ? 'سجّل الدخول أولًا عشان أسوي لك الفيديو.' : 'Please log in first to create videos.');
          if(__verr === 'daily_limit_reached') throw new Error(lang === 'ar' ? 'وصلت حد الفيديوهات اليومي، جرّب بكرة.' : 'Daily video limit reached, try again tomorrow.');
          throw new Error(__verr);
        }
        let __vurl = null;
        const __vt0 = Date.now();
        while(!__vurl){
          if(Date.now() - __vt0 > 6 * 60 * 1000) throw new Error(lang === 'ar' ? 'تأخر إنشاء الفيديو، جرّب مرة ثانية.' : 'Video generation timed out, please try again.');
          await new Promise(r => setTimeout(r, 5000));
          if(genAbortController.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
          const __sr = await fetch('/api/video-status?id=' + encodeURIComponent(__vid), { signal: genAbortController.signal });
          const __sd = await __sr.json().catch(() => ({}));
          if(__sd.status === 'SUCCEEDED'){ __vurl = Array.isArray(__sd.output) ? __sd.output[0] : __sd.output; }
          else if(__sd.status === 'FAILED'){ let __fr = __sd.failure || ''; if(/moderation|SAFETY|content did not pass/i.test(__fr)){ __fr = (lang === 'ar') ? 'الرقابة رفضت المحتوى — جرّب وصفًا أهدأ أو شِل صورة الشخص' : 'Content rejected by safety filters — try a calmer description or remove the person photo'; } throw new Error((lang === 'ar' ? 'فشل إنشاء الفيديو' : 'Video generation failed') + (__fr ? (' — ' + __fr) : '')); }
          else { chatPhase('🎬', (lang === 'ar' ? 'جاري إنشاء الفيديو… ' : 'Creating video… ') + (__sd.status || ''), thinkingDiv); }
        }
        cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? '🎬 فيديوك جاهز ✅ (الرابط صالح ٢٤ ساعة — نزّله عشان يظل عندك)' : '🎬 Your video is ready ✅ (link valid 24h — download it to keep it)'), attachments: [{ name: 'video.mp4', isVideo: true, url: __vurl }] });
        if(window.autoSaveVideo) window.autoSaveVideo(__vurl);
      }catch(e){
        if(!(e && e.name === 'AbortError')){
          cur.messages.push({ role: 'assistant', content: '⚠️ ' + __friendlyErr(e) });
        }
      }
      cur.lastMsgWasImageEdit = false;
      renderAll(); saveState();
      return;
    }
    
// v660: مؤشر تحميل الصور — خلفية نجوم + شريط تقدم + مراحل نصية
function __showImgLoading(el, ar, en){
  const _st = window.__chatStatus;
  if(_st && !_st.isReleased()){ try{ _st.release(); }catch(e){ /* guard-ok — cleanup, intentional */ } }
  if(!el) return;
  // v666: رجوع لبطاقة v664 — بطاقة رمادية بزوايا دائرية، نص «جارٍ إنشاء الصورة»، نقاط تتنفس
  if(!document.getElementById('omran-imgload-css')){
    const st = document.createElement('style'); st.id = 'omran-imgload-css';
    st.textContent = '@keyframes omranDotsBreathe{0%,100%{opacity:.35}50%{opacity:.9}}';
    document.head.appendChild(st);
  }
  // v672: بالوضع الفاتح تنعكس الألوان — بطاقة فاتحة ونقاط وكتابة غامقة (نفس الشكل)
  const __light = document.documentElement.getAttribute('data-mode') === 'light';
  const __cardBg = __light ? '#e9e9ec' : '#3a3a3d';
  const __txtCol = __light ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.85)';
  const __dotCol = __light ? 'rgba(0,0,0,.30)' : 'rgba(255,255,255,.35)';
  el.innerHTML = `<div style="display:block;width:min(340px,85vw);height:min(340px,85vw);background:${__cardBg};border-radius:24px;margin:6px 0;position:relative;overflow:hidden">
    <div style="position:absolute;top:18px;right:20px;color:${__txtCol};font-size:15px" dir="rtl">جارٍ إنشاء الصورة</div>
    <div style="position:absolute;inset:0;margin:auto;width:62%;height:52%;background-image:radial-gradient(${__dotCol} 1.2px,transparent 1.2px);background-size:16px 16px;-webkit-mask-image:radial-gradient(closest-side,#000 55%,transparent);mask-image:radial-gradient(closest-side,#000 55%,transparent);animation:omranDotsBreathe 2.4s ease-in-out infinite"></div>
  </div>`;
}

    // v579: صورة مرفقة + طلب قصير (مثلًا بعد زرّ «تعديل») = تعديل عليها افتراضيًّا — إلّا سؤال/بحث/فيديو/شكر/صورة جديدة/قراءة-ترجمة-وصف.
    const __ATT_EDIT = !!(__srcImg && !__srcImg._fromMemory && text && text.length <= 220 && __imgEditRe.test(text) && (!__IMGF_NOT_RE.test(text) || __IMG_EDIT_VERB_RE.test(text)) && !__IMGF_NEW_RE.test(text) && !__ATT_VISION_RE.test(text) && !__codeWordRe.test(text));
    /* v-nano-chat (المالك: «نفس فكرة نانو»): كتطبيق Gemini — صورة مرفقة مع أي طلب قصير ليس سؤالًا ولا كودًا
       = صورة جديدة من الفكرة نفسها؛ وأي رسالة قصيرة بعد صورة أنتجناها = تعديل عليها بلا إعادة رفع. */
    // صورة بلا طلب، أو معها سؤال/طلب قراءة = تحليل. أي أمر غير استفهامي يعدّل
    // نفس الصورة مباشرة، حتى لو كانت لقطة شاشة أو لم تأتِ من زر «تعديل».
    const __SHOT_ANALYZE = !!(__srcImg && !__srcImg._fromMemory && __srcImg._screenshot && !__IMG_UPGRADE && !__IMG_ELEVATE && !__imgEditRe.test(text || '') && !__IMGF_NEW_RE.test(text || '') && (!String(text || '').trim() || __nanoQ.test(text) || __ATT_VISION_RE.test(text)));
    const __ATT_DEFAULT = !!(__srcImg && !__srcImg._fromMemory && String(text || '').trim() && !__SHOT_ANALYZE && !__nanoQ.test(text) && !__ATT_VISION_RE.test(text) && !__codeWordRe.test(text) && !__IMGF_NEW_RE.test(text));
    // بعد أول تعديل تبقى آخر نتيجة هي المصدر. لا نفرض عدد كلمات، كي تعمل أوامر
    // متتابعة قصيرة مثل «أحمر» و«أكبر» مهما طال تسلسل التعديلات.
    const __FOLLOW_DEFAULT = !!((!__srcImg || __srcImg._fromMemory) && cur.lastMsgWasImageEdit && cur.lastEditedImage && cur.lastEditedImage.b64 && String(text || '').trim() && text.length <= 1200 && !__nanoQ.test(text) && !__ATT_VISION_RE.test(text) && !__codeWordRe.test(text) && !__IMGF_NEW_RE.test(text) && !/^\s*(?:هلا|مرحبا|السلام|شكرا|شكرًا|مشكور|تسلم|تمام|ممتاز|رائع|جميل|حلو|نعم|لا|ok|okay|thanks|thank you|nice|great|yes|no)\b/i.test(text));
    /* v-fresh-gen-wins (شكوى المالك: «عطني صور» مع صورة مرفقة كانت تُعدّل
       اللقطة بدل توليد صور جديدة → نتيجة زفت). طلب توليد صريح («عطني/ولّد/
       ارسم صورة») بلا أي فعل تعديل وبلا إشارة للمرفق = توليد جديد نظيف
       يتجاهل المرفق، إلّا لو كتب المستخدم فعل تعديل صريح أو أشار للصورة. */
    const __refersAttachment = /هذه?\s*الصور|هذي\s*الصور|هالصور|علي?ها|في?ها|من?ها|نفس\s*(?:الصور|الشكل|هذ)|\bthis\s*(?:image|picture|photo)\b|\bit\b/i.test(text || '');
    /* v-style-word-edit (رد «زفت»: «3d» مع صورة راح للنموذج النصي فشرح أي أداة
       تُستعمل بدل التنفيذ): كلمة أسلوب قصيرة مع صورة مرفقة — أو بعد صورة
       معدّلة للتو — = تحويل أسلوب فوري في محرر الصور، بلا حاجة لفعل «عدّل». */
    const __STYLE_RE = /(^|[\s،,])(3d|ثلاثي|مجسم|مجسّم|كرتون|كارتون|أنيمي|انمي|بيكسار|ديزني|زيتي|مائي|رصاص|بكسل|بيكسل|سايبر|نيون|كوميك|كومكس|مانجا|فانتازيا|واقعي|ستايل|أسلوب|اسلوب|نمط|anime|cartoon|pixar|disney|pixel|cyberpunk|neon|comic|manga|fantasy|watercolor|sketch|realistic|render|style)(?=$|[\s،,.!?؟])/i;
    const __styleShort = !!(text && text.length <= 80 && __STYLE_RE.test(text) && !__ATT_VISION_RE.test(text) && !__codeWordRe.test(text) && !/[؟?]\s*$/.test(text));
    const __ATT_STYLE = !!(__srcImg && !__srcImg._fromMemory && __styleShort);
    const __STYLE_FOLLOW = !!(!__srcImg && __styleShort && cur.lastEditedImage && cur.lastEditedImage.b64 && cur.lastMsgWasImageEdit);
    const __freshGenWins = !!(text && __srcImg && !__srcImg._fromMemory
      && __imgGenIntentRe.test(text)
      && !__imgEditRe.test(text) && !__IMG_UPGRADE && !__IMG_ELEVATE && !__IMG_FOLLOW && !__ATT_EDIT && __IMGF_NEW_RE.test(text)
      && !__refersAttachment && !__cardTidyIntent(text)
      && !/(شهادة|بطاقة|دعوة|بوستر|إعلان|اعلان|لوجو|شعار|بنر|غلاف|للتواصل|poster|logo|banner|certificate|card|invitation)/i.test(text));
    if(!__freshGenWins && !__SHOT_ANALYZE && text && !cur.adMode && !__isSupportQ && (__IMG_UPGRADE || __IMG_ELEVATE || __IMG_FOLLOW || __ATT_EDIT || __ATT_DEFAULT || __FOLLOW_DEFAULT || __ATT_STYLE || __STYLE_FOLLOW || (__srcImg && !__srcImg._fromMemory && __cardTidyIntent(text)) || __imgEditRe.test(text) || __imgGenIntentRe.test(text) || /(شهادة|بطاقة|دعوة|بوستر|إعلان|اعلان|لوجو|شعار|بنر|غلاف|تصميم|للتواصل|poster|logo|banner|design)/i.test(text)) && !__codeWordRe.test(text) && !__ATT_VISION_RE.test(text) && !/^(?:وش|شو|ايش|أيش|ليش|كيف|متى|وين|فين|هل|مين|كم|ما\b|من\b|why|how|what|where|when|who)/i.test(text) && !/[؟?]\s*$/.test(text) && (__srcImg || __followUp || __IMG_FOLLOW || __STYLE_FOLLOW || __FOLLOW_DEFAULT || ((__IMG_UPGRADE || __IMG_ELEVATE) && ((cur.lastEditedImage && cur.lastEditedImage.b64) || __IMG_UPGRADE_SRC)))){
      __showImgLoading(thinkingDiv, (__IMG_UPGRADE || __IMG_ELEVATE) ? 'جاري تطوير الصورة…' : 'جاري تعديل الصورة…', (__IMG_UPGRADE || __IMG_ELEVATE) ? 'Improving the image…' : 'Editing image…');
      const __upgSrc = (!__srcImg && (__IMG_UPGRADE || __IMG_ELEVATE) && !(cur.lastEditedImage && cur.lastEditedImage.b64)) ? __IMG_UPGRADE_SRC : null;
      const __b64 = __srcImg ? ((__srcImg.dataUrl || '').split(',')[1] || '') : (__upgSrc ? ((__upgSrc.dataUrl || '').split(',')[1] || '') : ((cur.lastEditedImage && cur.lastEditedImage.b64) || ''));
      const __mime = __srcImg ? (__srcImg.mime || 'image/png') : (__upgSrc ? (__upgSrc.mime || 'image/png') : ((cur.lastEditedImage && cur.lastEditedImage.mime) || 'image/png'));
      const __isNewImageSource = !!(__srcImg && !__srcImg._fromMemory);
      // 🏠 v682: مسار الديكور — صوّر غرفتك والذكاء يولّد ٤ أساليب مختلفة
      const __decorRe = /(?:ديكور|ديكو|décor|decor|تصميم\s*داخلي|interior\s*design|غير\s*(?:شكل|الشكل|الغرفة|البيت|المكان|الطابع)|حسّن\s*(?:الغرفة|البيت|المكان|الديكور)|رتّب\s*الغرفة|تزيين|أثاث\s*جديد|اقتراح\s*(?:ديكور|أثاث)|غرفتي\s*(?:غير|حسّن|بدّل)|بيتي\s*(?:غير|حسّن))/i;
      if(__decorRe.test(text) && __b64){
        // v684: أساليب ذكية تتغير حسب نوع المكان — مطعم، كوفي، محل، غرفة، مكتب، إلخ
        const __spaceStyles = {
          restaurant: [
            { ar:'عصري راقي',    en:'Modern Fine Dining', prompt:'Redesign this restaurant interior in a sleek MODERN FINE DINING style: dark moody palette, statement lighting pendants, marble tables, upholstered chairs, dramatic wall art. Keep layout identical. Photorealistic architectural render.' },
            { ar:'شعبي أصيل',   en:'Traditional Folk',   prompt:'Redesign this restaurant interior in a warm TRADITIONAL FOLK style: exposed brick walls, wooden beams, lanterns, arabesque tiles, rich rugs, authentic regional crafts. Keep layout identical. Photorealistic architectural render.' },
            { ar:'مفهومي فني',  en:'Artistic Concept',   prompt:'Redesign this restaurant as an ARTISTIC CONCEPT space: bold accent wall mural, eclectic art pieces, industrial metal + reclaimed wood, Edison-bulb pendants, vibrant color pops. Keep layout identical. Photorealistic architectural render.' },
            { ar:'فاخر رسمي',   en:'Luxury Formal',      prompt:'Redesign this restaurant in a LUXURY FORMAL style: gold-framed panels, crystal chandeliers, velvet booth seating, marble floors, fresh flowers, white-tablecloth ambiance. Keep layout identical. Photorealistic architectural render.' },
          ],
          cafe: [
            { ar:'صناعي دافئ',   en:'Industrial Warm',    prompt:'Redesign this cafe in an INDUSTRIAL WARM style: exposed brick, steel pipes, Edison bulbs, reclaimed wood bar, chalkboard menu, leather stools, earthy tones. Keep layout identical. Photorealistic architectural render.' },
            { ar:'بوهيمي نباتي', en:'Boho Botanical',     prompt:'Redesign this cafe in a BOHEMIAN BOTANICAL style: lush hanging plants, rattan furniture, macramé wall art, terracotta pots, warm earth palette, cozy nooks with cushions. Keep layout identical. Photorealistic architectural render.' },
            { ar:'اسكندنافي',    en:'Scandinavian',       prompt:'Redesign this cafe in a SCANDINAVIAN style: white walls, light birch wood, minimalist furniture, hygge warmth, simple pendant lights, functional beauty. Keep layout identical. Photorealistic architectural render.' },
            { ar:'كلاسيك فرنسي','en':'French Classic',    prompt:'Redesign this cafe in a FRENCH CLASSIC style: marble bistro tables, bentwood chairs, brass fixtures, mint-green accents, vintage posters, parisian charm. Keep layout identical. Photorealistic architectural render.' },
          ],
          clothing: [
            { ar:'بوتيك فاخر',   en:'Luxury Boutique',   prompt:'Redesign this clothing store as a LUXURY BOUTIQUE: ivory walls with gold trim, crystal display fixtures, velvet hangers, dramatic accent lighting, marble floors, elegant minimalism. Keep layout identical. Photorealistic architectural render.' },
            { ar:'عصري شبابي',  en:'Modern Youth',       prompt:'Redesign this clothing store in a MODERN YOUTH style: bold graphic murals, industrial pipe racks, neon accents, poured concrete floors, street-art vibes, social-media-worthy displays. Keep layout identical. Photorealistic architectural render.' },
            { ar:'بسيط أنيق',   en:'Clean Chic',         prompt:'Redesign this clothing store in a CLEAN CHIC style: all-white display walls, floating racks, spotlighting, neutral warm wood floors, glass display cases, uncluttered premium feel. Keep layout identical. Photorealistic architectural render.' },
            { ar:'تراثي حرفي',  en:'Heritage Artisan',   prompt:'Redesign this clothing store in a HERITAGE ARTISAN style: warm aged wood shelving, brass fixtures, embroidered display fabrics, traditional patterns as wall art, warm amber lighting. Keep layout identical. Photorealistic architectural render.' },
          ],
          bedroom: [
            { ar:'رومانسي',     en:'Romantic',           prompt:'Redesign this bedroom in a ROMANTIC style: soft pink/blush tones, draped canopy bed, plush pillows, warm fairy lights, floral wallpaper accent wall, velvet textures. Keep layout identical. Photorealistic architectural render.' },
            { ar:'فاخر',        en:'Luxury',             prompt:'Redesign this bedroom in a LUXURY style: upholstered headboard, silk bedding, crystal chandelier, mirrored wardrobe, thick carpet, rich cream and gold palette. Keep layout identical. Photorealistic architectural render.' },
            { ar:'اسكندنافي',   en:'Scandinavian',       prompt:'Redesign this bedroom in a SCANDINAVIAN style: white and light wood, linen bedding, simple pendant lights, plants, hygge warmth, clean uncluttered surfaces. Keep layout identical. Photorealistic architectural render.' },
            { ar:'صناعي عصري', en:'Industrial Modern',   prompt:'Redesign this bedroom in an INDUSTRIAL MODERN style: exposed concrete, steel frame bed, dark palette with warm wood accents, Edison bulbs, bold abstract art. Keep layout identical. Photorealistic architectural render.' },
          ],
          office: [
            { ar:'إبداعي ملوّن', en:'Creative Colorful',  prompt:'Redesign this office in a CREATIVE COLORFUL style: accent walls in bold colors, collaborative open zones, art-filled walls, mix of seating types, energizing vibrant palette. Keep layout identical. Photorealistic architectural render.' },
            { ar:'تنفيذي فاخر', en:'Executive Luxury',    prompt:'Redesign this office in an EXECUTIVE LUXURY style: dark wood paneling, leather furniture, statement desk, brass fixtures, library shelves, commanding authoritative feel. Keep layout identical. Photorealistic architectural render.' },
            { ar:'بيوفيليك',    en:'Biophilic',           prompt:'Redesign this office in a BIOPHILIC style: abundant indoor plants, natural wood, green living wall, natural light maximized, calming earth tones, nature-inspired textures. Keep layout identical. Photorealistic architectural render.' },
            { ar:'بسيط مركّز', en:'Minimalist Focus',    prompt:'Redesign this office in a MINIMALIST FOCUS style: white walls, sleek standing desks, hidden cables, acoustic panels, distraction-free environment, monochrome with one accent color. Keep layout identical. Photorealistic architectural render.' },
          ],
          living: [
            { ar:'عصري',        en:'Modern',             prompt:'Redesign this living room in a MODERN style: sectional sofa, geometric rug, statement pendant light, clean lines, neutral palette with one bold accent, gallery wall. Keep layout identical. Photorealistic architectural render.' },
            { ar:'فاخر',        en:'Luxury',             prompt:'Redesign this living room in a LUXURY style: velvet sofa, crystal chandelier, marble coffee table, gold accents, large artwork, layered textures, sophisticated palette. Keep layout identical. Photorealistic architectural render.' },
            { ar:'عربي خليجي', en:'Gulf Arabic',         prompt:'Redesign this living room in a GULF ARABIC style: ornate carved plasterwork, majlis floor seating with cushions, Persian rug, brass lanterns, warm jewel tones, arabesque patterns. Keep layout identical. Photorealistic architectural render.' },
            { ar:'اسكندنافي',   en:'Scandinavian',       prompt:'Redesign this living room in a SCANDINAVIAN style: white walls, light oak flooring, hygge cozy textiles, simple sofa, floor lamp, plants, calm natural palette. Keep layout identical. Photorealistic architectural render.' },
          ],
        };
        // كشف نوع المكان من النص
        const __spaceMap = [
          [/مطعم|restaurant|dining|مأكل|أكل/i, 'restaurant'],
          [/كوفي|قهوه|قهوة|كافيه|café|cafe|coffee/i, 'cafe'],
          [/محل\s*ملابس|بوتيك|ملابس|boutique|cloth|fashion|store/i, 'clothing'],
          [/غرفة\s*نوم|نوم|bedroom|sleeping/i, 'bedroom'],
          [/مكتب|office|عمل|work/i, 'office'],
          [/غرفة\s*(?:جلوس|معيشة|استقبال)|صالة|living|salon/i, 'living'],
        ];
        let __spaceKey = null;
        for(const __sm of __spaceMap){ if(__sm[0].test(text)){ __spaceKey = __sm[1]; break; } }
        const __decorStyles = __spaceKey ? __spaceStyles[__spaceKey] : [
          { ar:'عصري',        en:'Modern',         prompt:'Redesign this space with MODERN interior design: clean lines, neutral palette, contemporary furniture, ambient lighting. Keep layout identical. Photorealistic architectural render.' },
          { ar:'فاخر',        en:'Luxury',         prompt:'Redesign this space with LUXURY interior design: rich marble, gold accents, velvet, crystal lighting, jewel tones. Keep layout identical. Photorealistic architectural render.' },
          { ar:'بسيط',        en:'Minimalist',     prompt:'Redesign this space with MINIMALIST interior design: white walls, essential furniture, natural light, wood tones, zero clutter. Keep layout identical. Photorealistic architectural render.' },
          { ar:'عربي كلاسيك','en':'Classic Arabic', prompt:'Redesign this space with CLASSIC ARABIC interior design: mashrabiya patterns, mosaic tiles, lanterns, arabesque details, warm jewel colors. Keep layout identical. Photorealistic architectural render.' },
        ];
        const __spaceName = __spaceKey ? ({restaurant:'المطعم',cafe:'الكوفي',clothing:'المحل',bedroom:'غرفة النوم',office:'المكتب',living:'الصالة'}[__spaceKey]||'المكان') : 'المكان';
        // ضغط الصورة لـ 800px مرة واحدة
        const __decCmp = await new Promise(function(r4){
          const __di = new Image();
          __di.onload = function(){
            const __ms = 800, __sc = Math.min(1, __ms / Math.max(__di.naturalWidth||1, __di.naturalHeight||1));
            const __dc = document.createElement('canvas');
            __dc.width = Math.round((__di.naturalWidth||__ms)*__sc);
            __dc.height = Math.round((__di.naturalHeight||__ms)*__sc);
            __dc.getContext('2d').drawImage(__di,0,0,__dc.width,__dc.height);
            r4({ b64: __dc.toDataURL('image/jpeg',0.82).split(',')[1], mime:'image/jpeg' });
          };
          __di.onerror = function(){ r4({ b64:__b64, mime:__mime }); };
          __di.src = 'data:' + __mime + ';base64,' + __b64;
        });
        const __decorLabel = lang==='ar' ? ('🏠 أولّد لك ٤ أساليب لـ'+__spaceName+' — انتظر لحظة…') : '🏠 Generating 4 tailored decor styles — please wait…';
        if(thinkingDiv) thinkingDiv.querySelector && (thinkingDiv.querySelector('[data-phase]') || thinkingDiv).textContent !== undefined && chatPhase('🏠', lang==='ar' ? __decorLabel : __decorLabel, thinkingDiv);
        for(let __di2 = 0; __di2 < __decorStyles.length; __di2++){
          const __ds = __decorStyles[__di2];
          chatPhase('🏠', (lang==='ar' ? ('جاري توليد النمط ' + __ds.ar + ' (' + (__di2+1) + '/4)…') : ('Generating ' + __ds.en + ' style (' + (__di2+1) + '/4)…')), thinkingDiv);
          try{
            const __dRes = await fetch('/api/maha-image', {
              method:'POST', headers:{'Content-Type':'application/json'},
              signal: genAbortController.signal,
              body: JSON.stringify({ prompt: __ds.prompt, editImageBase64: __decCmp.b64, editMimeType: __decCmp.mime, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() })
            });
            const __dData = await __dRes.json().catch(()=>({}));
            if(__dRes.ok && __dData.imageBase64){
              const __dMime = __dData.mimeType || 'image/jpeg';
              cur.messages.push({ role:'assistant', content: (lang==='ar' ? ('نمط ' + __ds.ar) : (__ds.en + ' Style')), attachments:[{ name:'decor-'+__ds.en.toLowerCase()+'.jpg', isImage:true, mime:__dMime, dataUrl:'data:'+__dMime+';base64,'+__dData.imageBase64 }] });
              cur.lastEditedImage = { b64: __dData.imageBase64, mime: __dMime };
              // v683: احفظ كل أسلوب حتى يقدر المستخدم يعدّل على أي واحد منها لاحقاً
              if(!cur.decorHistory) cur.decorHistory = {};
              cur.decorHistory[__ds.ar] = { b64: __dData.imageBase64, mime: __dMime };
              renderAll(); saveState();
            }
          }catch(e){ if(e && e.name === 'AbortError') return; __swallow(e, 'decor:'+__ds.en); }
        }
        cur.lastMsgWasImageEdit = true;
        // تلميح للمستخدم بعد الانتهاء
        cur.messages.push({ role:'assistant', content: lang==='ar'
          ? 'اختر النمط الي أعجبك واكتب مثلاً: «عدّل النمط الفاخر وخلّ الأرضية بيج» — وسأطبّق تعديلك عليه فوراً.'
          : 'Pick a style and say e.g. "refine the luxury style with beige floors" — I will apply your changes to that exact result.' });
        renderAll(); saveState();
        return;
      }
      // 🏠 v683: تعديل على أسلوب ديكور محدد من النتائج السابقة
      if(cur.decorHistory && text){
        const __styleNames = { 'عصري':'عصري','عصرى':'عصري','فاخر':'فاخر','بسيط':'بسيط','عربي':'عربي كلاسيك','عربي كلاسيك':'عربي كلاسيك','classic':'عربي كلاسيك','modern':'عصري','luxury':'فاخر','minimalist':'بسيط' };
        const __refineRe = /(?:عدّل|عدل|غيّر|غير|حسّن|حسن|طوّر|طور|خذ|اشتغل\s+على|استخدم)\s+(?:ال)?نمط\s+(\S+)|(?:النمط|الأسلوب|الستايل)\s+ال?(\S+)\s+(?:عدّل|غيّر|حسّن)/i;
        const __rm = __refineRe.exec(text);
        const __rawStyle = __rm ? (__rm[1]||__rm[2]||'').replace(/[،,.؟?!]/g,'').trim().toLowerCase() : '';
        const __mappedStyle = __rawStyle ? (__styleNames[__rawStyle] || Object.keys(cur.decorHistory).find(k => k.includes(__rawStyle) || __rawStyle.includes(k.replace(' كلاسيك',''))) || '') : '';
        const __refSrc = __mappedStyle ? cur.decorHistory[__mappedStyle] : null;
        if(__refSrc){
          chatPhase('🏠', lang==='ar' ? ('جاري تعديل النمط '+__mappedStyle+'…') : 'Refining decor style…', thinkingDiv);
          const __refCmp = await new Promise(function(r5){
            const __ri = new Image();
            __ri.onload = function(){
              const __ms5=800,__sc5=Math.min(1,__ms5/Math.max(__ri.naturalWidth||1,__ri.naturalHeight||1));
              const __rc=document.createElement('canvas');__rc.width=Math.round((__ri.naturalWidth||__ms5)*__sc5);__rc.height=Math.round((__ri.naturalHeight||__ms5)*__sc5);
              __rc.getContext('2d').drawImage(__ri,0,0,__rc.width,__rc.height);r5({b64:__rc.toDataURL('image/jpeg',0.82).split(',')[1],mime:'image/jpeg'});
            };__ri.onerror=function(){r5(__refSrc);}; __ri.src='data:'+__refSrc.mime+';base64,'+__refSrc.b64;
          });
          try{
            const __refEdit = text.replace(__refineRe,'').trim() || text;
            const __refRes = await fetch('/api/maha-image',{method:'POST',headers:{'Content-Type':'application/json'},signal:genAbortController.signal,
              body:JSON.stringify({prompt:'Apply this change to the room decor: '+__refEdit+'. Keep the same overall style and room layout, only apply the specific requested change.',editImageBase64:__refCmp.b64,editMimeType:__refCmp.mime,token:authGet('aiapp_auth_token'),guestId:window.getGuestId()})});
            const __refData=await __refRes.json().catch(()=>({}));
            if(__refRes.ok&&__refData.imageBase64){
              const __refMime=__refData.mimeType||'image/jpeg';
              cur.decorHistory[__mappedStyle]={b64:__refData.imageBase64,mime:__refMime};
              cur.lastEditedImage={b64:__refData.imageBase64,mime:__refMime};
              cur.lastMsgWasImageEdit=true;
              cur.messages.push({role:'assistant',content:(lang==='ar'?'نمط '+__mappedStyle+' — بعد التعديل':'After edit — '+__mappedStyle),attachments:[{name:'decor-refined.jpg',isImage:true,mime:__refMime,dataUrl:'data:'+__refMime+';base64,'+__refData.imageBase64}]});
              renderAll();saveState();return;
            }
          }catch(e){if(e&&e.name==='AbortError')return;__swallow(e,'decor:refine');}
        }
      }
      // 🪪 v-tidy-card: صورة نموذج/بطاقة + «نفس المكتوب بس مرتب» → قراءة ثم رسم محلي مرتب
      if(__isNewImageSource && __b64 && __cardTidyIntent(text)){
        try{
          __showImgLoading(thinkingDiv, 'جاري قراءة النموذج…', 'Reading the card…');
          const __ceShr = await omranShrinkForEdit(__b64, __mime); /* v-edit-shrink */
          const __ceRes = await fetch('/api/tools?action=card-extract', {
            method:'POST', headers:{ 'Content-Type':'application/json' }, signal: genAbortController.signal,
            body: JSON.stringify({ imageBase64:__ceShr.b64, mimeType:__ceShr.mime, hint:String(text || '').slice(0, 300), token:authGet('aiapp_auth_token'), guestId:window.getGuestId() })
          });
          const __ceSpec = await __ceRes.json().catch(() => ({}));
          if(!__ceRes.ok || !Array.isArray(__ceSpec.rows) || !__ceSpec.rows.length){
            throw new Error(__ceSpec.message_ar || __ceSpec.error || ('HTTP ' + __ceRes.status));
          }
          chatPhase('🪪', lang === 'ar' ? 'جاري رسم النموذج بخط مرتب…' : 'Redrawing the card neatly…', thinkingDiv);
          const __cardB64 = await renderTidyCardCanvas(__ceSpec, 'data:' + __mime + ';base64,' + __b64);
          cur.lastEditedImage = { b64: __cardB64, mime: 'image/png' };
          cur.lastMsgWasImageEdit = true;
          cur.messages.push({ role:'assistant', content:'', attachments:[{ name:'tidy-card.png', isImage:true, mime:'image/png', dataUrl:'data:image/png;base64,' + __cardB64 }] });
          renderAll(); saveState(); return;
        }catch(e){
          if(e && e.name === 'AbortError') return;
          cur.messages.push({ role:'assistant', content:'⚠️ ' + __friendlyErr(e) });
          renderAll(); saveState(); return;
        }
      }
      // ✍️ إذا الطلب كتابة نص/اسم على الصورة → نرسمه محليًا بخط سليم (بدون Gemini)
      const __writeIntentRe = /(اكتب|أكتب|حط\s+(?:لي\s+)?(?:اسمي|اسم|كلمة|نص)|(?:ضيف|أضف|اضف)\s+(?:لي\s+)?(?:اسمي|اسم|كلمة|نص)|write|put\s+(?:my\s+)?name|add\s+(?:the\s+)?text)/i;
      let __textSpec = window.__parseImageTextSpec ? window.__parseImageTextSpec(text) : { wantsText:__writeIntentRe.test(text), exactText:extractOverlayText(text), fontKey:'modern', color:'#ffffff', position:'bottom' };
      const __styleOnly = __textSpec.styleEdit || (cur.imageTextLayer ? __textSpec.styleEditLoose : null);
      if(__styleOnly && cur.imageTextLayer){ __textSpec = Object.assign({}, __textSpec, { styleEdit: __styleOnly }); }
      if(__textSpec.styleEdit && cur.imageTextLayer){ const __l=Object.assign({},cur.imageTextLayer); Object.keys(__textSpec.styleEdit).forEach(k=>{if(__textSpec.styleEdit[k])__l[k]=__textSpec.styleEdit[k]}); try{const __outB64=await overlayTextOnImage(__l.baseB64,__l.baseMime,__l.text,__l.fontKey,__l.color,__l.position);cur.imageTextLayer=__l;cur.lastEditedImage={b64:__outB64,mime:'image/png'};cur.lastMsgWasImageEdit=true;cur.messages.push({role:'assistant',content:'' /* v671: بلا جملة فوق الصورة */,attachments:[{name:'edited.png',isImage:true,mime:'image/png',dataUrl:'data:image/png;base64,'+__outB64}]})}catch(e){cur.messages.push({role:'assistant',content:lang==='ar'?'تعذّر تعديل تنسيق الكتابة.':'Could not update the text styling.'})} renderAll();saveState();return; }
      if(__textSpec.wantsText){
        let __resolvedText = __textSpec.exactText;
        if(__resolvedText) __resolvedText = await omranSpellFix(__resolvedText); /* v-spell-quran */
        if(!__resolvedText && __textSpec.autoAuthored){
          try{
            const __planRes = await fetch('/api/maha-image', { method:'POST', headers:{'Content-Type':'application/json'}, signal:genAbortController.signal, body:JSON.stringify({ prayerRequest:String(__textSpec.prayerRequest || text).slice(0,800), textKind:__textSpec.kind, planPrayerOnly:true, textPosition:__textSpec.position, token:authGet('aiapp_auth_token'), guestId:window.getGuestId() }) });
            const __planData = await __planRes.json().catch(() => ({}));
            if(__planRes.ok && typeof __planData.authoredText === 'string') __resolvedText = __planData.authoredText.trim();
          }catch(e){ if(e && e.name === 'AbortError') return; }
        }
        if(!__resolvedText){
          cur.messages.push({ role:'assistant', content:__textSpec.autoAuthored ? (lang==='ar'?'تعذّر تأليف الدعاء بدقة الآن. جرّب مرة أخرى.':'Could not author the prayer accurately. Please try again.') : (lang==='ar'?'أرسل النص نفسه الذي تريده على الصورة، وسأكتبه حرفيًا بلا تغيير.':'Send the exact wording you want on the image, and I will reproduce it verbatim.') });
          renderAll(); saveState();
          return;
        }
        try{
          const __pos = __textSpec.positionAuto ? 'auto' : __textSpec.position;
          // 🎨 v576: طلب مركّب (تعديل بصريّ + كتابة) = مرحلتان — المولّد يعدّل الصورة أولًا،
          // ثم نكتب النصّ فوق ناتجه. حاجز v574 محفوظ: بلا visualEdit صريح لا يلمس المولّد الصورة.
          let __wb64 = __b64, __wmime = __mime;
          const __visRe = /(?:خلفية|خلفيه|background|لون|لوّن|غير|غيّر|بدل|بدّل|حول|حوّل|امسح|احذف|ازل|أزل|اضف|أضف|ضيف|اجعل|خل|صحراء|بحر|سماء|ورد|زهور|ليل|غروب|blur)/i;
          const __noTouchRe = /(?:بدون|بلا|دون|من\s+غير)\s*(?:أي\s*)?(?:تغيير|تغير|تعديل|مساس|لمس)|لا\s*(?:تغير|تغيّر|تعدل|تلمس)|without\s+(?:any\s+)?(?:change|edit|alter)/i;
          const __visEdit = (__textSpec.visualEdit && __visRe.test(__textSpec.visualEdit) && !__noTouchRe.test(text)) ? String(__textSpec.visualEdit).slice(0, 600) : '';
          if(__visEdit){
            chatPhase('🎨', lang === 'ar' ? 'جاري تعديل الخلفية…' : 'Editing background…', thinkingDiv);
            try{
              const __wShr = await omranShrinkForEdit(__wb64, __wmime); /* v-edit-shrink */
              __wb64 = __wShr.b64; __wmime = __wShr.mime;
              const __vRes = await fetch('/api/maha-image', {
                method:'POST', headers:{ 'Content-Type':'application/json' },
                signal: genAbortController.signal,
                body: JSON.stringify({ prompt:__visEdit, editImageBase64:__wb64, editMimeType:__wmime, reserveTextArea:true, textPosition:__textSpec.position })
              });
              const __vData = await __vRes.json().catch(() => ({}));
              if(__vRes.ok && __vData.imageBase64){ __wb64 = __vData.imageBase64; __wmime = __vData.mimeType || 'image/png'; }
            }catch(e){ if(e && e.name === 'AbortError') return; __swallow(e, "img:visualEdit-v576"); }
            chatPhase('✍️', lang === 'ar' ? 'جاري كتابة النص…' : 'Writing text…', thinkingDiv);
          }
          // 🖌️ v681: الذكاء يرسم الخط أولاً (ضغط لـ800px يمنع 413) → كانفس كبديل احتياطي فقط
          const __compressB64 = (b64, mime) => new Promise(function(res3){
            const __ci2 = new Image();
            __ci2.onload = function(){
              /* v-hifi-edit: 800px كانت تمسح تفاصيل نصوص البطاقة فيعيد المحرك رسمها خربانة — 1600px تبقى تحت حد الطلب وتحفظ القراءة */
              const __mxd2 = 1600, __sc2 = Math.min(1, __mxd2 / Math.max(__ci2.naturalWidth||1, __ci2.naturalHeight||1));
              const __cc2 = document.createElement('canvas');
              __cc2.width = Math.round((__ci2.naturalWidth||__mxd2) * __sc2);
              __cc2.height = Math.round((__ci2.naturalHeight||__mxd2) * __sc2);
              __cc2.getContext('2d').drawImage(__ci2, 0, 0, __cc2.width, __cc2.height);
              res3({ b64: __cc2.toDataURL('image/jpeg', 0.88).split(',')[1], mime: 'image/jpeg' });
            };
            __ci2.onerror = function(){ res3({ b64, mime }); };
            __ci2.src = 'data:' + mime + ';base64,' + b64;
          });
          let __finalB64 = null, __finalMime = 'image/png';
          /* v-named-font: المستخدم سمّى خطًا (رقعة/ديواني/ثلث…) = يريد ميزة
             الخطوط المحلية بعينها — الكانفس يكتب بخطه المطلوب على صورته
             نفسها بلا أي توليد (رسّام الذكاء يتجاهل اختيار الخط ويعيد رسم
             المشهد أحيانًا — لقطة الطفل المستبدل). */
          /* v-font-pretty: الكلمات الجمالية أيضًا = رسم محلي بخط مزخرف مضمون */
          const __wantsNamedFont = /(ديواني|رقع[ةه]|كوفي|عثماني|نسخ|ثلث|فارسي|نستعليق|مصحف|قرآني|diwani|ruqaa|kufi|othmani|naskh|thuluth|farsi|nastaliq|quran|مزخرف|زخرف|بخط\s+(?:جميل|حلو|مرتب|أنيق|انيق|راقي|فخم|رائع|مميز|ملكي)|beautiful|fancy|elegant|ornate|decorated)/i.test(text || '');
          /* v-name-swap (لقطة بطاقة التجنيد: «غيري الاسم واكتبي سيف» كتب الجملة
             فوق البطاقة وترك «أحمد») — نية تغيير الاسم/النص الموجود = أمر
             استبدال للرسّام: يمحو القديم ويكتب الجديد في مكانه بنفس الأسلوب. */
          const __nameSwap = /(?:غير|غيّر|غيري|غيّري|بدل|بدّل|بدلي|بدّلي|استبدل|استبدلي)\s+(?:ال[إا]سم|اسم|النص|الكلمة|الكلمه|المكتوب)/i.test(text || '');
          try{
            /* v-style-honor (شكوى: «غير الخط واللون ووين مكانه — ما صار شي»):
               رسّام الذكاء يتجاهل اللون والموضع المطلوبين — أي طلب فيه تنسيق
               صريح (خط مسمّى أو لون أو موضع) يُرسم محليًا بالكانفس الذي يحترمه. */
            /* v-exact-canvas (شكوى: «عبداله مران تيم — الأسامي ليس دقيقة»):
               رسّام الذكاء يسقط حروفًا من الأسماء العربية. النص الحرفي يطبعه
               الراسم المحلي دائمًا — حرفيًا بلا خطأ إملائي ممكن، وبخطوطه
               المزخرفة الشغالة (v-font-real). الذكاء فقط لتبديل اسمٍ داخل
               تصميم (الوحيد القادر على المحو). */
            if(!__nameSwap) throw { __localFont: true }; /* مباشرة للكانفس */
            const __cmp = await __compressB64(__wb64, __wmime);
            const __aiTxtPrompt = __nameSwap
              ? 'This image contains a personal name (or short text) written on it. REPLACE that existing name with the EXACT Arabic text \u00AB' + __resolvedText + '\u00BB: erase the old name completely and write the new one in its exact place, matching the original calligraphy style, size, color and orientation as closely as possible. The script MUST be classical ARABIC calligraphy (Thuluth or Diwani), upright and horizontal like the original \u2014 NEVER Urdu Nastaliq, never slanted Persian-style lettering. Do NOT change anything else \u2014 keep every other text, logo, decoration and layout identical.'
              : 'Write this EXACT Arabic text verbatim onto the image — do NOT change, add, or remove any word or letter: \u00AB' + __resolvedText + '\u00BB. Use beautiful classical ARABIC calligraphy (Thuluth or Diwani \u2014 NEVER Urdu Nastaliq or slanted Persian lettering) with full diacritics (tashkeel) harmonizing with the scene palette and lighting. Place it ONLY in a clean empty area (sky, wall, margins) — NEVER over faces or the main subject. Do not alter anything else.';
            const __aiTRes = await fetch('/api/maha-image', {
              method:'POST', headers:{ 'Content-Type':'application/json' },
              signal: genAbortController.signal,
              body: JSON.stringify({ prompt: __aiTxtPrompt, editImageBase64: __cmp.b64, editMimeType: __cmp.mime, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() })
            });
            const __aiTData = await __aiTRes.json().catch(() => ({}));
            if(__aiTRes.ok && __aiTData.imageBase64){ __finalB64 = __aiTData.imageBase64; __finalMime = __aiTData.mimeType || 'image/jpeg'; }
          }catch(e){ if(e && e.name === 'AbortError') return; __swallow(e, 'img:aiText-v681'); }
          /* v-edit-honest: في الاستبدال، الكانفس لا يمحو الاسم القديم —
             الكتابة فوق البطاقة «غش» (كلمة عمران). فشل الرسّام = مصارحة. */
          if(!__finalB64 && __nameSwap){
            cur.messages.push({ role:'assistant', content: lang==='ar'
              ? 'ما قدرت أبدّل الاسم داخل التصميم هالمرة — محرك تعديل الصور مشغول أو رفض هذا التصميم. أعد المحاولة بعد دقيقة، وإذا تكررت جرّب صورة أوضح.'
              : 'I could not replace the name inside the design this time — the image editor is busy or declined this design. Try again in a minute.' });
            renderAll(); saveState();
            return;
          }
          // احتياطي: كانفس إذا فشل الذكاء
          if(!__finalB64){
            try{ __finalB64 = await overlayTextOnImage(__wb64, __wmime, __resolvedText, __textSpec.fontKey, __textSpec.color, __pos); __finalMime = 'image/png'; }
            catch(e2){ cur.messages.push({ role:'assistant', content:lang==='ar'?'تعذّرت كتابة النص على الصورة.':'Could not add text to image.' }); renderAll(); saveState(); return; }
          }
          cur.imageTextLayer = { baseB64:__wb64, baseMime:__wmime, text:__resolvedText, fontKey:__textSpec.fontKey, color:__textSpec.color, position:__pos };
          cur.messages.push({ role: 'assistant', content: '', attachments: [{ name: 'edited.png', isImage: true, mime: __finalMime, dataUrl: 'data:' + __finalMime + ';base64,' + __finalB64 }] });
          cur.lastEditedImage = { b64: __finalB64, mime: __finalMime };
          cur.lastMsgWasImageEdit = true;
          renderAll(); saveState();
          return;
        }catch(e){
          cur.messages.push({ role:'assistant', content:lang==='ar'?'تعذّرت كتابة النص على الصورة.':'Could not add text to image.' });
          renderAll(); saveState();
          return;
        }
      }
      // 🛡️ v574: نيّة كتابة صريحة بلا نصّ مفهوم → نطلب النصّ ولا نمسّ الصورة.
      // ممنوع منعًا باتًا أن يعيد مولّد الصور رسمها في شؤون الكتابة.
      if(!__textSpec.wantsText && !__textSpec.styleEdit && window.__imageWriteIntent && window.__imageWriteIntent(text)){
        cur.messages.push({ role:'assistant', content:(lang === 'ar'
          ? 'أكتبه لك على نفس الصورة بدون أي تغيير فيها — بس حدّد النص بين علامتي تنصيص، مثل: اكتب «عمران» بالأصفر في الأعلى.'
          : 'I will write it on the same image without altering it — put the exact text in quotes, e.g. write «Omran» in yellow at the top.') });
        cur.lastMsgWasImageEdit = true;
        renderAll(); saveState();
        return;
      }
      /* 🔤 v-text-swap: تغيير نص مكتوب (تاريخ/اسم/رقم) → قراءة بالرؤية وتبديل محلي
         دقيق؛ إن لم تجد الرؤية سطرًا نصيًا يسقط الطلب لمسار المولّد كالسابق. */
      if(__b64 && __textSwapIntent(text)){
        try{
          chatPhase('🔎', lang === 'ar' ? 'جاري قراءة الكتابة على الصورة…' : 'Reading the text on the image…', thinkingDiv);
          const __tsShr = await omranShrinkForEdit(__b64, __mime);
          const __tsRes = await fetch('/api/tools?action=text-swap', {
            method:'POST', headers:{ 'Content-Type':'application/json' }, signal: genAbortController.signal,
            body: JSON.stringify({ imageBase64:__tsShr.b64, mimeType:__tsShr.mime, request:String(text || '').slice(0, 400), token:authGet('aiapp_auth_token'), guestId:window.getGuestId() })
          });
          const __tsSpec = await __tsRes.json().catch(() => ({}));
          if(__tsRes.ok && __tsSpec.found && __tsSpec.box && __tsSpec.newLine){
            chatPhase('✍️', lang === 'ar' ? 'جاري تبديل النص بدون المساس بالصورة…' : 'Swapping the text in place…', thinkingDiv);
            const __masked = await omranBuildTextEditMask(__b64, __mime, __tsSpec.box);
            const __maskedRes = await fetch('/api/maha-image', {
              method:'POST', headers:{ 'Content-Type':'application/json' }, signal:genAbortController.signal,
              body:JSON.stringify({
                prompt:'Replace only the selected existing text with exactly «' + __tsSpec.newLine + '». Match its original style, color, size and alignment. Do not change anything outside the transparent mask.',
                editImageBase64:__masked.sourceB64, editMimeType:'image/png', editMaskBase64:__masked.maskB64,
                exactTextEdit:true, token:authGet('aiapp_auth_token'), guestId:window.getGuestId()
              })
            });
            const __maskedData = await __maskedRes.json().catch(() => ({}));
            if(!__maskedRes.ok || !__maskedData.imageBase64) throw new Error('masked_text_edit_failed');
            const __tsB64 = await omranMergeTextEditRegion(__masked.sourceB64, 'image/png', __maskedData.imageBase64, __maskedData.mimeType || 'image/png', __masked.region);
            cur.lastEditedImage = { b64: __tsB64, mime: 'image/png' };
            cur.lastMsgWasImageEdit = true;
            cur.messages.push({ role:'assistant', content:'', attachments:[{ name:'edited.png', isImage:true, mime:'image/png', dataUrl:'data:image/png;base64,' + __tsB64 }] });
            renderAll(); saveState(); return;
          }
        }catch(e){
          if(e && e.name === 'AbortError') return;
          __swallow(e, 'img:text-swap');
          cur.messages.push({ role:'assistant', content:lang==='ar'?'تعذّر تبديل الحرف بدقة هذه المرة. أعد المحاولة بدون تغيير بقية الصورة.':'The character could not be replaced precisely this time. Please retry.' });
          cur.lastMsgWasImageEdit = true;
          renderAll(); saveState(); return;
        }
        cur.messages.push({ role:'assistant', content:lang==='ar'?'لم أستطع تحديد الحرف المطلوب بثقة. حدده بكلمة أوضح.':'I could not locate the requested character confidently.' });
        cur.lastMsgWasImageEdit = true;
        renderAll(); saveState(); return;
      }
      const __continuesEditChain = !__isNewImageSource && cur.lastEditedImage && cur.lastEditedImage.b64 === __b64;
      const __original = latestOriginalUserImage(cur);
      const __pendingImageEditSource = { b64:__b64, mime:__mime };
      const __combinedEdit = cumulativeImageEditPrompt(cur, text, true);
      const __editShr = await omranShrinkForEdit(__pendingImageEditSource.b64, __pendingImageEditSource.mime); /* v-edit-shrink */
      const __editB64 = __editShr.b64;
      const __editMime = __editShr.mime;
      const __editPrompt = __combinedEdit.prompt;
      const __pendingImageEditInstructions = __combinedEdit.edits;
      let __extraImgs;
      if(imageAttachments.length > 1){
        __extraImgs = [];
        for(const __xa of imageAttachments.slice(0, -1)){
          const __xs = await omranShrinkForEdit((__xa.dataUrl || '').split(',')[1] || '', __xa.mime || 'image/png');
          __extraImgs.push({ data: __xs.b64, mime: __xs.mime });
        }
      }
      const __res = await fetch('/api/maha-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: genAbortController.signal,
        body: JSON.stringify({ prompt: __editPrompt, userText: String(text || '').slice(0, 600) /* v-nano-pro-edit: كلمات المستخدم نفسها للنيّة */, editImageBase64: __editB64, editMimeType: __editMime, sceneUpgrade: __IMG_UPGRADE || undefined, extraImages: __extraImgs, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
      });
      const __data = await __res.json().catch(() => ({}));
      const __ok = __res.ok && !!__data.imageBase64;
      if(!__ok) __data.__status = __res.status;
      if(__ok){
        const __outMime = __data.mimeType || 'image/png';
        let __editUrl = 'data:' + __outMime + ';base64,' + __data.imageBase64;
        try{ __editUrl = await omranSharpenImage(__editUrl); }catch(e){ __swallow(e, 'img:sharpen-edit'); }
        cur.messages.push({ role: 'assistant', content: (typeof __data.caption === 'string' ? __data.caption : '') /* v-nano-chat: جملة قصيرة مع الصورة */, attachments: [{ name: 'edited.png', isImage: true, mime: (__editUrl.slice(5).split(';')[0] || __outMime), dataUrl: __editUrl }] });
        // v-img-engine-tag: بصمة المحرك في شريط الحالة — يحسم «أي محرك نفّذ» فورًا.
        try{ if(window.__chatStatus) window.__chatStatus.note('🎨', (/openai/.test(String(__data.engine || '')) ? 'gpt-image' : (/pro/.test(String(__data.engine || '')) ? 'نانو بنانا برو' : 'نانو بنانا'))); }catch(e){ __swallow(e, 'ui:img-engine'); }
        cur.lastEditedImage = { b64: __data.imageBase64, mime: __outMime };
        cur.imageEditSource = __pendingImageEditSource;
        cur.imageEditInstructions = __pendingImageEditInstructions;
        cur.imageTextLayer = null;
        cur.lastMsgWasImageEdit = true;
        // 🔄 نحفظ الطلب كما هو ليعيده زر «نسخة ثانية» بتنويعة جديدة
        try{ window.__omranLastImageReq = { kind:'edit', url:'/api/maha-image', body: { prompt: __editPrompt, userText: String(text || '').slice(0, 600), editImageBase64: __editB64, editMimeType: __editMime, sceneUpgrade: __IMG_UPGRADE || undefined, extraImages: __extraImgs } }; }catch(e){ __swallow(e, 'img:save-req'); }
      } else {
        cur.messages.push({ role: 'assistant', content: imgErrFriendly(__data && __data.error, lang === 'ar') || ((lang === 'ar' ? '⚠️ تعذر تعديل الصورة: ' : '⚠️ Image edit failed: ') + ((__data && __data.error) || ('HTTP ' + (__data.__status || '?')))) });
        cur.lastMsgWasImageEdit = true;
      }
      renderAll(); saveState();
      return;
    }
    // 🏗️ v260: طلب تصميم معماري نصي من المحادثة (تصميم/مخطط + غرف/فيلا/بيت...)
    // → مخطط 2D + واجهة خارجية + مواصفات نصية من المزود — كلها في رد واحد.
    let __archImagesDone = false;
    const __designDocRe = /(شهادة|بطاقة|دعوة|بوستر|إعلان|اعلان|لوجو|شعار|بنر|غلاف|سيرة ذاتية|certificate|invitation|poster|logo|banner|\bcv\b|resume)/i;
    const __archVerbRe = /(تصميم|صمم|صمّم|صممي|مخطط|اسكتش|ابني|أبني|نبني|بناء|ارسم|أرسم|ارسمي)/i;
    const __archHomeRe = /(غرف|غرفة|غرفتين|صالة|صاله|فيلا|فله|فلة|بيت|منزل|شقة|شقه|ملحق|مجلس|استراحة|عمارة|مزرعة|دور\s?أرضي|واجهة|villa|floor\s?plan|house\s?design|apartment\s?design)/i;
    // ⛔ طلبات الإيجار/البيع/الأسعار = بحث حي، مو تصميم معماري.
    const __archExcludeRe = /(ايجار|إيجار|اجار|أجار|تأجير|تاجير|استئجار|للبيع|شراء|اشتري|بكم|سعر|أسعار|اسعار|rent|for\s?sale|price)/i;
    // 🏗️ v297: متابعة قصيرة بعد تصميم معماري («طابق 1»، «الواجهة»، «الدور الثاني»...) تكمل نفس المسار.
    const __archFollowRe = /(طابق|الطابق|دور|الدور|واجهة|الواجهة|مخطط|المخطط|خارطة|توزيع|غرف|غرفة|مجلس|صالة|صاله|مطبخ|حمام|حديقة|مدخل|سور|مواقف|ملحق|سطح|قبو|الشكل الخارجي|شكل خارجي|floor|facade|plan|garden|entrance|roof|basement|exterior)/i;
    // ✅ v303: «نعم/ابدأ/يلا/تمام» بعد رد معماري = تنفيذ فوري (مخطط + واجهة) بلا أسئلة.
    const __archAffirmRe = /^\s*(نعم|أجل|اجل|ايه|إيه|اي نعم|اوك|أوك|اوكي|أوكي|تمام|زين|طيب|يلا|يالله|ابدا|ابدأ|أبدأ|ابدي|كمل|أكمل|اكمل|نفذ|نفّذ|سو|سوها|yes|ok|okay|go|start|sure|continue)[\s.!،؟]*$/i;
    // ✅ v303: لو الرد الأخير من المساعد كان مواصفات معمارية نصية (بدون صور)، نعتبره سياق معماري حتى لو lastArchText فاضي.
    let __archCtxText = cur.lastArchText || '';
    if(!__archCtxText){
      try{
        const __la = [...cur.messages].reverse().find(m => m && m.role === 'assistant' && typeof m.content === 'string');
        if(__la && __la.content.length > 250 && /(فيلا|فله|فلة|منزل|بيت|مخطط|واجهة(?!\s*(?:المستخدم|مستخدم|برمجي))|غرف(?:ة)?\s*نوم|م²|دور\s?أرضي|ماستر|floor\s?plan|facade)/i.test(__la.content) && !/```/.test(__la.content) && !/(function|class |const |import |namespace|#include|برمج|كود|code|script|API|SDK|C#|C\+\+|Python|Java(?:Script)?)/i.test(__la.content)){
          __archCtxText = __la.content.replace(/\s+/g, ' ').slice(0, 1500);
        }
      }catch(e){ __swallow(e, "misc:app-09-attach#18"); }
    }
    // ✅ v373: السياق المعماري صالح فقط إذا كان آخر رد مساعد بنفس الموضوع —
    // «نعم» بعد رد عن فنادق/مواضيع ثانية ممنوع يرجّع تصميم فيلا قديم من lastArchText.
    if(__archCtxText){
      try{
        const __laChk = [...cur.messages].reverse().find(m => m && m.role === 'assistant' && typeof m.content === 'string');
        if(!__laChk || !/(مخطط|واجهة(?!\s*(?:المستخدم|مستخدم|برمجي))|م²|متر مربع|دور\s?أرضي|ماستر|مواصفات|توزيع داخلي|الشكل الخارجي|floor\s?plan|facade|exterior)/i.test(__laChk.content) || /(function|class |const |import |namespace|#include|برمج|كود|code|script|API|SDK|C#|C\+\+|Python|Java(?:Script)?)/i.test(__laChk.content)){
          __archCtxText = '';
          cur.lastArchText = '';
        }
      }catch(e){ __swallow(e, "misc:app-09-attach#19"); }
    }
    const __archAffirm = !!(__archCtxText && text && __archAffirmRe.test(text));
    const __archFollowUp = !!(__archCtxText && text && !__srcImg && !__followUp &&
       !__codeWordRe.test(text) && !__designDocRe.test(text) && !__archExcludeRe.test(text) &&
       (__archAffirm || (text.length < 120 && __archFollowRe.test(text))));
    if(text && !__srcImg && !__followUp && !__codeWordRe.test(text) && !__designDocRe.test(text) &&
       ((__archVerbRe.test(text) && __archHomeRe.test(text) && !__archExcludeRe.test(text)) || __archFollowUp)){
      const __archText = __archFollowUp ? (__archAffirm ? __archCtxText : (__archCtxText + ' — والمطلوب الآن تحديدًا: ' + text)) : text;
      cur.lastArchText = __archFollowUp ? __archCtxText : text;
      const __archGen = async (label, prompt) => {
        chatPhase('⚙️', label, thinkingDiv);
        let __d = {}; let __k = false;
        try{
          for(let __t3 = 0; __t3 < 3 && !__k; __t3++){
            // ✅ v301: مهلة متزايدة بين المحاولات — أخطاء Gemini المؤقتة (429/500)
            // كانت تفشّل صورة الواجهة بصمت عند محاولتين متتاليتين بدون انتظار.
            if(__t3) await new Promise(r => setTimeout(r, 1500 * __t3));
            const __r = await fetch('/api/maha-image', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              signal: genAbortController.signal,
              body: JSON.stringify({ prompt: prompt.slice(0, 1800), token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
            });
            __d = await __r.json().catch(() => ({}));
            __k = __r.ok && !!__d.imageBase64;
          }
        }catch(e){ if(e && e.name === 'AbortError') throw e; }
        return __k ? __d : null;
      };
      try{
        let __floorsCount = 0;
        const __fm = __archText.match(/(\d+|واحد|وحده|وحدة|اثنين|ثنتين|ثلاث(?:ة)?|أربع(?:ة)?|اربع(?:ة)?)\s*(?:طوابق|طابق|أدوار|ادوار|دور|floors?|stor(?:y|ies))/i) || __archText.match(/(?:طابق|دور)\s*(واحد|1|١)/);
        if(__fm){ const __w = __fm[1]; __floorsCount = /^\d+$/.test(__w) ? parseInt(__w) : ({'واحد':1,'وحده':1,'وحدة':1,'١':1,'1':1,'اثنين':2,'ثنتين':2,'ثلاث':3,'ثلاثة':3,'أربع':4,'أربعة':4,'اربع':4,'اربعة':4}[__w] || 0); }
        if(!__floorsCount && /أرضي|ارضي/.test(__archText)) __floorsCount = 1;
        const __floorRule = __floorsCount ? (' STRICT REQUIREMENT: the building must have EXACTLY ' + __floorsCount + ' floor(s)' + (__floorsCount === 1 ? ' — single-story ground-level building only, absolutely no upper floor, no first floor windows above, flat single-level roofline' : '') + '. Do not add extra floors.') : '';
        // ✅ v304: مطابقة حرفية — موقع المسبح + عدد مواقف السيارات في صورة الواجهة.
        let __poolRule = '';
        if(/مسبح|حوض\s*سباح|swimming\s?pool|\bpool\b/i.test(__archText)){
          __poolRule = /داخلي|وسط|حوش|فناء|courtyard|central|inner/i.test(__archText)
            ? ' STRICT: the swimming pool is located in an INNER COURTYARD at the CENTER of the building, surrounded by the house wings — it must NOT appear in front of the villa; show it glimpsed through the central courtyard.'
            : ' STRICT: include the swimming pool exactly where the request places it — do not relocate it.';
        }
        let __garageRule = '';
        const __gm = __archText.match(/(?:كراج|جراج|مواقف|موقف|garage|carport|parking)[^\d٠-٩]{0,15}(\d+|١|٢|٣|٤|واحد|وحدة|اثنتين|اثنين|سيارتين|ثلاث(?:ة)?|أربع(?:ة)?|اربع(?:ة)?)|(\d+|سيارتين|ثلاث|أربع|اربع)\s*سيار(?:ات|ة)/i);
        if(__gm){
          const __gw = __gm[1] || __gm[2];
          const __gn = /^\d+$/.test(__gw) ? parseInt(__gw) : ({'١':1,'٢':2,'٣':3,'٤':4,'واحد':1,'وحدة':1,'اثنين':2,'اثنتين':2,'سيارتين':2,'ثلاث':3,'ثلاثة':3,'أربع':4,'أربعة':4,'اربع':4,'اربعة':4}[__gw] || 0);
          if(__gn) __garageRule = ' STRICT: the garage/carport must fit EXACTLY ' + __gn + ' car(s) — show ' + __gn + ' parking bay(s), not more, not fewer.';
        }
        const __planImg = await __archGen(
          lang === 'ar' ? '📐 جاري رسم المخطط 2D…' : '📐 Drawing 2D floor plan…',
          'Professional 2D architectural floor plan, top-down view, CAD blueprint style, for this request: "' + __archText + '". Clean technical drawing, every room labeled in Arabic with its area in square meters, dimensions in meters on all walls, furniture layout drawn inside rooms, thin black lines with soft pastel colored room fills, white background, no 3D, no photo. STRICTLY FORBIDDEN: any company names, brand names, phone numbers, account numbers, placeholder text, or watermarks anywhere in the image — the only text allowed is Arabic room labels, areas, and wall dimensions.');
        if(__planImg){
          const __pm = __planImg.mimeType || 'image/png';
          cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? '📐 المخطط 2D بالمقاسات:' : '📐 2D floor plan with dimensions:'), attachments: [{ name: 'plan-2d.png', isImage: true, mime: __pm, dataUrl: 'data:' + __pm + ';base64,' + __planImg.imageBase64 }] });
          renderAll(); saveState();
        }
        const __extImg = (__archFollowUp && !__archAffirm && !/واجهة|الواجهة|خارجي|الشكل|facade|exterior/i.test(text)) ? null : await __archGen(
          lang === 'ar' ? '🏠 جاري توليد الواجهة الخارجية…' : '🏠 Generating exterior facade…',
          'Photorealistic exterior architectural photograph of the finished building.' + __floorRule + __poolRule + __garageRule + ' Request: "' + __archText + '". STRICT CONSISTENCY REQUIREMENT: this exterior photo must depict the exact same building described in the request and its 2D floor plan — same number of floors, same entrances (including a separate majlis/guest entrance if mentioned), same garage/carport, swimming pool and outdoor kitchen only if mentioned, same facade materials and window sizes as specified. Do NOT invent floors, wings, or elements not in the request. Modern UAE/Gulf villa facade, sand-tone and stone finishes with dark window frames, covered entrance, landscaped front yard, clear daytime sky, ultra realistic professional real-estate photo, no text, no watermark.');
        if(__extImg){
          const __em = __extImg.mimeType || 'image/png';
          cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? '🏠 الشكل الخارجي:' : '🏠 Exterior view:'), attachments: [{ name: 'exterior.png', isImage: true, mime: __em, dataUrl: 'data:' + __em + ';base64,' + __extImg.imageBase64 }] });
          cur.lastEditedImage = { b64: __extImg.imageBase64, mime: __em };
          renderAll(); saveState();
        }
        __archImagesDone = !!(__planImg || __extImg);
      }catch(e){
        if(e && e.name === 'AbortError'){ renderAll(); saveState(); return; }
      }
      if(__archImagesDone){
        // ✅ v301: المسار المعماري نفّذ الطلب فعلًا (مخطط + واجهة) — تُلغى بوابة
        // البناء والطلب المعلّق نهائيًا حتى لا يسأل مزود ثانٍ «تبيني أبدأ البناء؟».
        __gateNoBuild = false;
        try{ window.__pendingBuildPrompt = null; localStorage.removeItem('aiapp_pending_build'); }catch(e){ __swallow(e, "misc:app-09-attach#20"); }
        chatPhase('✍️', lang === 'ar' ? 'جاري كتابة المواصفات…' : 'Writing the specifications…', thinkingDiv);
      }
      // لا return هنا — يكمل للمزود عشان يكتب المواصفات النصية تحت الصور.
    }
    // 🏛️ v225: طلب نصي بنية صورة بدون أي صورة مرفقة (تصور معماري/منظور/ارسم...)
    // → توليد صورة فعلي بـ Gemini بدل رد نظري أو وعود فارغة من المزود.
    const __txtOnlyImgRe = /^\s*صور[هة]\s+\S|(تصور|منظور|بورتريه|ارسم|أرسم|ارسمي|رسمة|معماري|معمارية|واجهات\s|تصميم\s*(?:لي\s*)?صوره?|صمم\s*(?:لي\s*)?صوره?|توليد\s*صوره?|(?:انشئ|أنشئ|انشاء|إنشاء|اصنع)\s*(?:لي\s*)?صوره?|صوره?\s*(?:من|عن)\s*الخيال|خيال\s*علمي|render|perspective|elevation|concept\s?art|\bdraw\b|\bpainting\b)/i;
    if(text && (!__srcImg || __freshGenWins) && !__followUp && !__archImagesDone && !__codeWordRe.test(text) && (!__designDocRe.test(text) || __explicitImageTextRequest) &&
       (__explicitImageTextRequest || __txtOnlyImgRe.test(text) || (__imgGenIntentRe.test(text) && /صور|رسمة|منظر|تصور|image|picture|visual/i.test(text)))){
      if(!__txtOnlyImgRe.test(text) && __isVagueMediaRequest(text)){
        cur.messages.push({ role: 'assistant', content: lang === 'ar' ? 'صورة عن شو؟ وصفلي اللي تبيه 🖼️' : 'An image of what? Describe what you want 🖼️' });
        renderAll(); saveState();
        thinkingDiv && thinkingDiv.remove();
        return;
      }
      const __genTextSpec = window.__parseImageTextSpec ? window.__parseImageTextSpec(text) : { wantsText:false, exactText:null, visualPrompt:text };
      if(__genTextSpec.wantsText && !__genTextSpec.exactText && !__genTextSpec.autoAuthored){
        cur.messages.push({ role:'assistant', content:lang==='ar'?'أرسل النص نفسه الذي تريده على الصورة، وسأكتبه حرفيًا بلا تغيير.':'Send the exact wording you want on the image, and I will reproduce it verbatim.' });
        renderAll(); saveState();
        thinkingDiv && thinkingDiv.remove();
        return;
      }
      __showImgLoading(thinkingDiv, 'جاري إنشاء الصورة…', 'Generating image…');
      let __gData = {}; let __gOk = false;
      try{
        for(let __t2 = 0; __t2 < 2 && !__gOk; __t2++){
          const __gRes = await fetch('/api/maha-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: genAbortController.signal,
            body: JSON.stringify({ prompt: String(__genTextSpec.visualPrompt || text).slice(0,1200), reserveTextArea:!!__genTextSpec.wantsText, textPosition:__genTextSpec.position, prayerRequest:__genTextSpec.autoAuthored ? String(__genTextSpec.prayerRequest || text).slice(0,800) : undefined, textKind:__genTextSpec.kind, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
          });
          __gData = await __gRes.json().catch(() => ({}));
          __gOk = __gRes.ok && !!__gData.imageBase64;
          if(!__gOk){ if(!__gData) __gData = {}; __gData.__status = __gRes.status; }
        }
        if(__gOk){
          let __resolvedText = __genTextSpec.exactText ? await omranSpellFix(__genTextSpec.exactText) : ((__genTextSpec.autoAuthored && typeof __gData.authoredText === 'string') ? __gData.authoredText.trim() : ''); /* v-spell-quran */
          if(__genTextSpec.wantsText && !__resolvedText) throw new Error('missing_authored_prayer');
          if(__resolvedText){
            cur.imageTextLayer = { baseB64:__gData.imageBase64, baseMime:__gData.mimeType||'image/png', text:__resolvedText, fontKey:__genTextSpec.fontKey, color:__genTextSpec.color, position:__genTextSpec.position };
            __gData.imageBase64 = await overlayTextOnImage(__gData.imageBase64, __gData.mimeType || 'image/png', __resolvedText, __genTextSpec.fontKey, __genTextSpec.color, __genTextSpec.position);
            __gData.mimeType = 'image/png';
          }
        }
      }catch(e){
        if(e && e.name === 'AbortError'){ renderAll(); saveState(); return; }
        __gOk = false;
        __gData = { error: (e && e.message) ? e.message : String(e) };
      }
      if(__gOk){
        const __gm = __gData.mimeType || 'image/png';
        cur.messages.push({ role: 'assistant', content: '' /* v666: بلا جملة فوق الصورة — طلب عمران */, attachments: [{ name: 'generated.png', isImage: true, mime: __gm, dataUrl: 'data:' + __gm + ';base64,' + __gData.imageBase64 }] });
        cur.lastEditedImage = { b64: __gData.imageBase64, mime: __gm };
        cur.lastMsgWasImageEdit = true;
      } else {
        cur.messages.push({ role: 'assistant', content: imgErrFriendly(__gData && __gData.error, lang === 'ar') || ((lang === 'ar' ? '⚠️ تعذر إنشاء الصورة: ' : '⚠️ Image generation failed: ') + ((__gData && __gData.error) || ('HTTP ' + (__gData.__status || '?')))) });
        cur.lastMsgWasImageEdit = false;
      }
      renderAll(); saveState();
      return;
    }
    // 🧠 v574: صورة محفوظة في المحادثة تبقى قابلة للمتابعة حتى لو مرّت رسائل بينها،
    // فلا يُطلب من المستخدم إرسال صورته مرّة ثانية بعد كل تعديلين.
    if(!(cur.lastEditedImage && cur.lastEditedImage.b64)) cur.lastMsgWasImageEdit = false;
    // v464 — حقن ذكي: قواعد البناء الثقيلة تُرسل فقط عند طلب بناء/تصميم فعلي.
    // الأسئلة العادية تحصل على system prompt خفيف = ردود أفضل + ما يشفّر.
    const __bldRe = /(ابني|ابن\s|بناء|نبني|اعمل|أعمل|سوي|سوّي|سو\b|سوّ\b|صمم|صمّم|انشئ|أنشئ|انشاء|إنشاء|اصنع|عدل|عدّل|طور|طوّر|اضف|أضف|كمل|أكمل|build|create|make|design|develop|fix|add|update|improve)/i;
    const __appWd = /(تطبيق|موقع|لعبة|برنامج|بوت|صفحة|أداة|app|website|game|bot|page|tool|clone)/i;
    const __dsnRe = /(إعلان|بوستر|شهادة|بطاقة|دعوة|لوجو|شعار|بنر|غلاف|منشور|poster|flyer|certificate|card|invitation|logo|banner|cover)/i;
    const __needsBuild = (__bldRe.test(text) && __appWd.test(text)) || __dsnRe.test(text) || !!cur.code || !!window.__buildOfferApproved;
    // v469: Q&A = بروم خفيف مثل ChatGPT؛ البناء = تعليمات كاملة.
    let __sys;
    if(__needsBuild){
      __sys = t('systemPrompt') + APP_IDENTITY_NOTE + CONVERSATION_QUALITY_RULE + TOPIC_FOLLOW_RULE + BUILD_COMPLETENESS_RULE + NO_FAKE_EDIT_RULE + CHAT_STYLE_RULE + APP_CAPABILITY_RULE;
      if(__dsnRe.test(text)) __sys += DESIGN_POSTER_RULE;
    } else {
      __sys = 'أنت مساعد ذكي في تطبيق Omran AI من فريق عمران AI.' + CONVERSATION_QUALITY_RULE +
        '\n[قواعد سياق المحادثة]:\n' +
        '- التأكيد القصير بعد سؤال منك (نعم/تمام/يلا/أوكي) موافقة؛ أكمل فورًا.\n' +
        '- لا تنادِ المستخدم باسم إلا إذا كان محفوظًا في ذاكرته أو ذكره في هذه المحادثة.\n' +
        '- الرسالة القصيرة قد تكون متابعة للموضوع السابق؛ افهمها من السياق بدل معاملتها كموضوع عشوائي.\n' +
        '- السؤال العادي أو النقاش يُجاب عنه نصيًّا بلا كود ما لم يطلب المستخدم البناء صراحة.\n' +
        '- التطبيق يوفّر توليد الصور والفيديو وPDF؛ استخدم القدرة المناسبة بدل ادعاء العجز.\n' +
        '- التحية الخالصة لها رد قصير مستقل. أمّا سؤال المجاملة أو المتابعة مثل «كيف الحال؟» فأجب عنه كحديث مستمر بلا إعادة تحية أو عرض خدمة.';
    }
    /* v-reply-lang2 (تدقيق المالك ٢٩ أغسطس: «على حسب السؤال — كل واحد ولغته»):
       الأساس لغة رسالة المستخدم نفسها، أيًّا كانت لغة الواجهة. لغة الواجهة
       احتياط فقط حين لا تُعرف لغة الرسالة (أرقام، إيموجي، كلمة غامضة).
       القواعد الملحقة العربية كانت تجرّ النموذج للعربي — هذه توقفه. */
    const __LANG_NAMES = { ar:'Arabic', en:'English', zh:'Chinese', hi:'Hindi', es:'Spanish', fr:'French', bn:'Bengali', ru:'Russian', ur:'Urdu', id:'Indonesian', fil:'Filipino', tr:'Turkish', ne:'Nepali', ml:'Malayalam' };
    const __uiLangName = __LANG_NAMES[(typeof lang !== 'undefined' && lang) ? lang : 'ar'] || 'Arabic';
    __sys += '\nREPLY LANGUAGE RULE (mandatory, highest priority): ALWAYS write your ENTIRE reply in the SAME language the user\'s latest message is written in — whoever writes in Malayalam gets Malayalam, whoever writes in French gets French, and so on, regardless of the app UI language. The fact that the instructions above are written in Arabic or English does NOT mean you should reply in them. Only when the message\'s language cannot be determined (numbers, emoji, a name, an ambiguous short word), fall back to the app UI language, which is ' + __uiLangName + '. Never default to Arabic unless the user wrote in Arabic or that fallback applies.';
    // الدور الاجتماعي القصير يُعزل عن الذاكرة والمواضيع السابقة، لكن سؤال الحال
    // يبقى استمرارًا للمحادثة لا تحية جديدة.
    const __quietSocialTurn = isPureGreeting(text) || isCasualCheckIn(text);
    /* v-style-rebirth: التوجيه القديم كان يفرض «كلمة إلى ثلاث بلا سؤال» فخرجت
       التحية جافة حتى من النموذج — المالك رفضها. الآن بروح المجلس. */
    if(isPureGreeting(text)){
      __sys = 'المستخدم أرسل تحية لفظية خالصة. رحّب به ترحيبًا حارًّا راقيًا بروح المجلس فيه حضور وشخصية — جملة أو جملتان بلا صيغة محفوظة — واسأله سؤالًا واحدًا طبيعيًّا عن حاله أو يومه. ممنوع «كيف أقدر أساعدك؟» الرسمية وعرض الخدمات، وممنوع فتح مواضيع قديمة أو استخدام الذاكرة.';
    } else if(isCasualCheckIn(text)){
      __sys = 'هذا سؤال حال ضمن محادثة مستمرة، وليس تحية جديدة. أجب عن حالك بدفء وحضور — جملتان أو ثلاث فيها روح — واسأله عن حاله أو يومه بسؤال واحد طبيعي. لا تبدأ بتحية جديدة، ولا تعرض المساعدة، ولا تذكر أي مشروع أو اهتمام أو موضوع سابق، ولا تلتزم صيغة محفوظة.';
    }
    /* v-clean-slate: __sys (كتاب قواعد العميل الثابت) يُوسم static — مسار العقل
       الواحد يرشّحه (هوية النظام هناك من الخادم القصير)، والمسار الاحتياطي
       القديم يبقى عليه. التوجيهات السياقية لكل دور (تحية، بناء، صورة) تمر. */
    const apiMessages = [{role: 'system', content: __sys, __static: true}];
    /* v-topic-switch (شكوى المالك: يغيّر الموضوع فيجيه جواب الأول والثاني معًا):
       TOPIC_FOLLOW_RULE كان داخل النظام الثابت الذي يُرشَّح عن مسار الأدوات —
       نسخة قصيرة غير ثابتة تصل المسارين، وتأتي أخيرة فتغلب. */
    /* v-pasted-analyze (لقطة المالك: لصق تقرير رفض هواوي فبنى النموذج تطبيقًا
       بدل تحليله — رأى «Submit an app with … features» فاعتبره طلب بناء):
       نص طويل ملصوق (تقرير/رسالة/سجل/خطأ) بلا أمر بناء صريح = تحليل وشرح
       وخطوات، لا بناء ولا كود. */
    const __pastedDoc = !!(text && !__strongBuildRe.test(text) && (text.length > 400 || text.split('\n').length >= 6 || /\b(issue|suggestion|rejected|review|error|exception|traceback|report|dear|regards)\b/i.test(text)));
    if(__pastedDoc) apiMessages.push({role: 'system', content: 'رسالة المستخدم الأخيرة نصٌّ ملصوق (تقرير أو رسالة أو سجل أخطاء) وليست طلب بناء. حلّله: ماذا يعني، ما السبب، وما الخطوات العملية المطلوبة من المستخدم بالترتيب — بلغة المستخدم. ممنوع منعًا باتًا بناء تطبيق أو صفحة أو أي كتلة كود ردًّا عليه، حتى لو ورد فيه «app» أو «feature» أو «submit» — إلا إذا كتب المستخدم بنفسه أمر بناء صريحًا.'});
    if(!__quietSocialTurn) apiMessages.push({role: 'system', content: 'قاعدة الموضوع (أولوية قصوى): أجب عن رسالة المستخدم الأخيرة وحدها. إذا كان موضوعها مختلفًا عن الرسائل السابقة فاترك السابق تمامًا — لا تكمله ولا تلخصه ولا تذكره ولا تجيب عنه مرة أخرى. تاريخ المحادثة خلفية فقط، وليس قائمة مهام.', __topicRule: true});
    // 🤝 v345: المستخدم وافق على عرض بناء قدّمه المزود في رده السابق — يبنيه الآن كاملًا.
    if(window.__buildOfferApproved){
      apiMessages.push({role: 'system', content: 'BUILD-OFFER APPROVAL (highest priority): In your PREVIOUS assistant message you offered to build a specific tool/app for the user and asked permission to start. The user has just approved. Build EXACTLY the tool/app you offered in that previous message NOW — completely, as ONE working single-file ```html app in this reply. Do NOT re-explain, do NOT repeat your earlier advice, do NOT ask again, and NEVER return to any earlier request that was rejected. Just build the offered tool fully.'});
      window.__buildOfferApproved = false;
    }
    // 🏗️ v260: الصور المعمارية انعرضت فوق — المزود يكتب المواصفات فقط.
    if(__archImagesDone){
      apiMessages.push({role: 'system', content: 'IMPORTANT CONTEXT FOR THIS TURN ONLY: a 2D architectural floor plan image AND a photorealistic exterior facade image were ALREADY generated and shown to the user above for their request. Do NOT say you cannot draw, do NOT tell the user to rephrase, do NOT promise images. Your job now: write ONLY the full written specifications in Arabic for this design — التوزيع الداخلي بالمساحات بالمتر المربع لكل غرفة، المواصفات الداخلية (أرضيات، أسقف، إضاءة، تكييف، نوافذ)، المواصفات الخارجية (واجهة، مواد، سور، مواقف)، وتوصية واحدة حاسمة في النهاية. Start directly with the specifications.'});
    }
    // 👁️ صورة مرفقة مع السؤال → أمر صريح بتحليلها بالتفصيل وعدم الرد الفارغ
    if(imageAttachments.length){
      apiMessages.push({role: 'system', content: 'The user has ATTACHED an image with this message. You MUST look at the attached image carefully and answer based on its actual visual content in detail (identify objects, brands, models, text, measurements — whatever is relevant to the question). Never say you cannot see images, never give a generic answer that ignores the image, and never reply with empty or evasive text.'});
    }
    /* 📰 v-news-intent (شكوى المالك: «اخبار العالمي» فُهمت نادي النصر واختُرعت
       نتائج مباريات): طلب أخبار عام = أخبار دولية حقيقية من بحث حي — لا نادٍ
       رياضي إلا إذا سمّاه المستخدم بنفسه، ولا اختراع خبر بلا مصدر أبدًا. */
    if(text && /(اخبار|أخبار|الاخبار|الأخبار|\bnews\b)/i.test(text)
      && !/(النصر|الهلال|الاتحاد|الأهلي|الاهلي|ريال|برشلونة|دوري|مباراة|مباريات|كورة|كرة|لاعب|فريق|نادي|رياضة|رياضية|football|soccer|match|league|team|club|sport)/i.test(text)){
      apiMessages.push({role: 'system', content: 'طلب المستخدم أخبارًا عامة. «أخبار العالم/العالمية/العالمي/آخر الأخبار» تعني عناوين الأخبار الدولية العامة (سياسة، اقتصاد، أحداث كبرى) — وليست أخبار أي نادٍ رياضي: كلمة «العالمي» وحدها ليست نادي النصر. ابحث الآن بحثًا حيًّا عن أحدث العناوين وقدّم ٥-٧ عناوين موجزة بمصادرها. ممنوع منعًا باتًا اختراع أي خبر أو نتيجة مباراة أو تاريخ من ذاكرتك — إذا لم يتوفر لك بحث حي فقل ذلك بصراحة بجملة واحدة.'});
    }
    // v686: وضع الإعلان — فرض توليد HTML إعلان فوراً بدون نص
    if(cur.adMode === 'inside' || cur.adMode === 'outside'){
      const __hasUserImg = !!(cur.lastEditedImage && cur.lastEditedImage.b64);
      const __bgRule = __hasUserImg
        ? "Use background-image:url('__USER_IMAGE__') — the app automatically replaces this token with the user's real photo."
        : "No user photo available. Create a STUNNING CSS-only cinematic background: use a radial or linear gradient matching the product vibe (cars → dark charcoal + gold shimmer; real estate → deep navy + warm amber; phone → near-black + electric blue; default → dark slate + gold). Add a subtle CSS animation (slow shimmer or pulse). Make it look premium.";
      apiMessages.push({role:'system', content:`ADVERTISEMENT POSTER DESIGN — HIGHEST PRIORITY

You are a world-class Arabic advertising designer. Build a jaw-dropping, print-ready HTML advertisement RIGHT NOW.

BACKGROUND RULE: ${__bgRule}

REQUIRED OUTPUT FORMAT:
\`\`\`html
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  /* 800×800px, dark luxury aesthetic, glass-morphism cards, gold accents */
</style>
</head>
<body>
  <!-- Full-screen background, then overlay, then content -->
  <!-- Product title prominent at top -->
  <!-- Details in frosted glass cards in the middle/lower section -->
  <!-- WhatsApp CTA button at bottom if phone number in text -->
  <!-- Subtle "عمران AI" brand mark -->
</body>
</html>
\`\`\`

DESIGN RULES (non-negotiable):
1. 800×800px — no scrollbars (overflow:hidden on body)
2. Rich dark background — photo or CSS gradient, NEVER plain white or grey
3. Glass-morphism info cards: background:rgba(255,255,255,0.1); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.2); border-radius:16px
4. Gold accent color: #FFD700 for prices and labels
5. White bold Arabic titles with text-shadow for legibility
6. Grid of 2-4 cards showing all numerical details (price, year, mileage, rooms, area, specs…)
7. If a phone number is in the text → WhatsApp green CTA button at bottom
8. RTL layout, Arabic-first typography
9. Zero lorem ipsum — use ONLY real data from the user's message
10. Output ONLY the \`\`\`html block — absolutely no text before or after it`});
    }
    // 🧠 الذاكرة طويلة المدى لا تدخل التحية أو سؤال الحال؛ كلاهما لا يحتاج
    // مشاريع المستخدم واهتماماته، وكانت هي مصدر فتح المواضيع القديمة.
    const __memMsg = __quietSocialTurn ? null : memorySystemMsg();
    if(__memMsg) apiMessages.push(__memMsg);
    if(cur.code){
      apiMessages.push({role: 'assistant', content: '```' + (cur.codeType === 'python' ? 'python' : 'html') + '\n' + codeForApi(cur.code) + '\n```'});
    }
    // Only the last few turns are sent (plus the current full code above) so that
    // long-running projects (many edit rounds) don't blow past provider token
    // limits and silently fail with no result.
    // If the CURRENT message is just a plain question (not itself a build
    // request), strip out any earlier "build me an app/bot/site" user turns
    // from the history sent to the provider. Otherwise a model can see that
    // old, already-fulfilled build request sitting in the history and decide
    // to "helpfully" resume building it alongside the answer to the new,
    // unrelated question - producing a reply that mixes a real answer with
    // leftover app-building text the user never asked for this turn.
    const __historyBuildRe = /بوت|تطبيق|برنامج|موقع|صفحة|\bapp\b|\bwebsite\b|\bpage\b|\bbot\b/i;
    // ⚠️ البناء لا يبدأ إلا بأمر صريح (ابنِ/اعمل/سوّي...) + كلمة تطبيق/موقع/بوت.
    // مجرد ذكر "موقع" أو "تطبيق" في سؤال عادي (مثل "فكرة عن هذا الموقع") لا يشغّل البناء.
    const __buildCmdRe = /(ابني|ابن\s|بناء|نبني|اعمل|أعمل|سوي|سوّي|صمم|صمّم|انشئ|أنشئ|انشاء|إنشاء|اصنع|اضف|أضف|عدل|عدّل|طور|طوّر|حدث|حدّث|كمل|أكمل|اكمل|build|create|make|design|develop|add|update|improve|fix)/i;
    const __curIsBuildTask = __historyBuildRe.test(text) && __buildCmdRe.test(text);
    // Keep merged-answer messages (isMergeHeader) in history: they ARE the
    // assistant's reply in ask-all mode. Without them, old user questions
    // look unanswered, so providers "helpfully" re-answer them and mix topics.
    // ردود المزود المختار ✅ (فقاعة مزود واحد بدون رأس دمج في نفس الدفعة) يجب أن
    // تبقى في الذاكرة، وإلا تبدو أسئلة المستخدم القديمة بلا جواب فيعيد المزود
    // الرد عليها ويخلط المواضيع.
    let __historyMsgs = cur.messages.filter(m =>
      !m.providerLabel || m.isMergeHeader ||
      // 🧠 إصلاح الذاكرة (٧ أغسطس ٢٠٢٦): كان الشرط يشترط askAllReply — وهي false
      // لكل ردّ عاديّ منذ v463، فكانت كل ردود المساعد تسقط من السياق: المستخدم يسأل
      // والتطبيق لا يتذكّر أنه أجاب. الآن يبقى كل ردّ حقيقيّ، ويسقط فقط الفاشل
      // والجاري وردود دفعة «اسأل الكل» التي لها رأس دمج يمثّلها.
      (!m._failed && !m._loading &&
        !(m.batchId && cur.messages.some(x => x !== m && x.isMergeHeader && x.batchId === m.batchId)))
    );
    if(!__curIsBuildTask){
      // ✅ v323: آخر 5 رسائل تبقى كاملة في الذاكرة حتى لو فيها كلمات بناء —
      // حذفها كان يقطع سياق الموضوع الجاري (طلب تصميم ثم متابعة قصيرة).
      const __keepFrom = __historyMsgs.length - 5;
      // v654 — الحذف فقط لأوامر البناء الفعلية (كلمة بناء + أمر صريح): مجرد ذكر
      //    «موقع/تطبيق» في رسالة قديمة كان يمسحها من الذاكرة فينسى النموذج المحادثة.
      __historyMsgs = __historyMsgs.filter((m, __i) => { if(__i >= __keepFrom || m.role !== 'user') return true; const __t = (m.apiText !== undefined ? m.apiText : (m.content || '')); return !(__historyBuildRe.test(__t) && __buildCmdRe.test(__t)); });
    }
    // 🔒 الصور تُرسل فقط مع الرسالة الحالية (الأخيرة) — صور الرسائل القديمة
    // لا تُعاد إرسالها أبدًا حتى لا يظل المزود يحلل صورة قديمة بدل السؤال الجديد.
    {
      const MAX_TURNS = 24;        // عدد أدوار المحادثة المرسلة كاملة
      const MAX_CHARS = 90000;     // سقف حجم السياق الكلي
      const MAX_PER_MSG = 7000;    // سقف الرسالة الواحدة (بلا قص من المنتصف)

      // ① مرساة الموضوع: أوائل رسائل المحادثة تبقى كتعليمة نظام قصيرة
      //    حتى لا يضيع موضوع المحادثة الأصلي بعد عشرات الرسائل.
      if(__historyMsgs.length > MAX_TURNS){
        const __openers = __historyMsgs.slice(0, __historyMsgs.length - MAX_TURNS).filter(m => m.role === 'user').slice(0, 3);
        if(__openers.length){
          const __anchorTxt = __openers.map(m => {
            let s = String(__stripCodeForHistory('user', (m.apiText !== undefined ? m.apiText : m.content)) || '').replace(/\b\S+\.(jpg|jpeg|png|webp|gif)\b/gi, '(صورة)');
            return '- ' + (s.length > 300 ? s.slice(0, 300) + '…' : s);
          }).join('\n');
          apiMessages.push({role: 'system', content: '📌 موضوع هذه المحادثة الأصلي (للرجوع إليه عند الأسئلة المتصلة فقط):\n' + __anchorTxt + '\n⛔ لا تفتح موضوعًا قديمًا من نفسك إذا كان سؤال المستخدم الجديد غير متعلق به.'});
        }
      }

      // ② أدوار محادثة حقيقية بدل ضغط السجل في رسالة system واحدة.
      //    هذا هو الإصلاح الأساسي: النموذج يرى محادثة، لا تعليمات.
      let __turns = [];
      if(!__quietSocialTurn){
        __historyMsgs.slice(-MAX_TURNS).forEach(m => {
          if(!m || m._loading || m._failed) return;
          const role = (m.role === 'user') ? 'user' : 'assistant';
          let txt = String(__stripCodeForHistory(role, (m.apiText !== undefined ? m.apiText : m.content)) || '').trim();
          if(!txt) return;
          txt = txt.replace(/\b\S+\.(jpg|jpeg|png|webp|gif)\b/gi, '(صورة سابقة)');
          if(txt.length > MAX_PER_MSG) txt = txt.slice(0, MAX_PER_MSG) + '…'; // قص من الآخر فقط
          const prev = __turns[__turns.length - 1];
          if(prev && prev.role === role) prev.content += '\n\n' + txt; // دمج بدل الرفض
          else __turns.push({role, content: txt});
        });
      }

      // ③ الرسالة الحالية دائمًا آخر دور
      const __lastM = __historyMsgs[__historyMsgs.length - 1];
      if(__lastM){
        const __curText = String((__lastM.apiText !== undefined ? __lastM.apiText : __lastM.content) || '');
        if(__turns.length && __turns[__turns.length - 1].role === __lastM.role) __turns.pop();
        __turns.push({role: __lastM.role, content: __curText});
      }

      // ④ تنظيف: يبدأ بـ user، ويبقى ضمن سقف الحجم
      while(__turns.length && __turns[0].role !== 'user') __turns.shift();
      const __size = () => __turns.reduce((n, m) => n + m.content.length, 0);
      while(__turns.length > 2 && __size() > MAX_CHARS) __turns.splice(0, 2); // زوجًا للحفاظ على التناوب
      while(__turns.length && __turns[0].role !== 'user') __turns.shift();

      // ⑤ الصور على الرسالة الأخيرة فقط (v687: في وضع الإعلان لا ترسل الصورة)
      const __lastTurn = __turns[__turns.length - 1];
      if(__lastTurn && __lastTurn.role === 'user' && !cur.adMode && __lastM && __lastM.apiImages) __lastTurn.images = __lastM.apiImages;

      __turns.forEach(m => apiMessages.push(m));
    }

    // 🔍 قراءة وتحليل قوي للصور المرفقة: تعليمة رؤية شاملة تُحقن فقط عند وجود صورة
    if(imageAttachments.length && !cur.adMode && imageAttachments.some(a => a && a._screenshot)){
      // v-visual-assist: دور المساعد البصري للقطات الواجهات
      apiMessages.push({role: 'system', content: lang === 'ar'
        ? 'أنت المساعد البصري داخل تطبيق عمران AI. المرفق لقطة شاشة لواجهة (تطبيق/موقع/إعدادات/رسالة خطأ). اقرأ الواجهة والأزرار والنصوص والقوائم بدقة كما تظهر فعلًا، وسمِّ العناصر بأسمائها المكتوبة في اللقطة. إذا كان فيها خطأ أو مشكلة: قل سببها بجملة ثم أعطِ خطوات قصيرة مرقّمة (٣ إلى ٦ خطوات) يطبّقها المستخدم مباشرة، كل خطوة تبدأ بالزر أو المكان الذي يضغطه. إذا كان الطلب غير واضح فاشرح ما تراه في اللقطة باختصار ثم اقترح الخطوة التالية المنطقية. لا تصف الألوان والتصميم إلا إذا سُئلت، ولا تخترع أزرارًا غير موجودة في اللقطة.'
        : 'You are the visual assistant inside the Omran AI app. The attachment is a UI screenshot (app/website/settings/error message). Read the interface, buttons, texts and menus exactly as they appear and name elements by their visible labels. If it shows an error or problem: state the cause in one sentence, then give short numbered steps (3 to 6) the user can follow right away, each starting with the button or place to tap. If the request is unclear, briefly explain what the screenshot shows and suggest the logical next step. Do not describe colors or design unless asked, and never invent buttons that are not in the screenshot.'});
    }
    if(imageAttachments.length && !cur.adMode){
      apiMessages.push({role: 'system', content: 'صورة مرفقة — القاعدة الأولى والأهم:\n0) إذا كتب المستخدم مع الصورة سؤالًا أو طلبًا محددًا فأجب عن طلبه هو فقط، مباشرة وباختصار مفيد — ممنوع منعًا باتًا نسخ نصوص الصورة كاملة أو سرد تحليل شامل (عناصر/ألوان/تقييم/خطوات) لم يطلبه. التحليل الشامل أدناه يُطبَّق فقط إذا أرسل الصورة بلا طلب محدد أو طلب صراحةً «حلّل الصورة».\n1) عند التحليل الشامل فقط: اقرأ كل نص ظاهر في الصورة حرفيًا كما هو (عربي أو إنجليزي أو أي لغة) واذكره كاملًا بدون تلخيص.\n2) عند التحليل الشامل فقط: حلّل الصورة بعمق: العناصر، الأشخاص، الألوان، المكان، السياق، الأرقام، الجداول، أي أخطاء أو ملاحظات مهمة، واستنتاجاتك.\n3) في كل الحالات، الإجابة تكون مربوطة بالصورة نفسها: حدّد أولًا أي شاشة/صفحة بالضبط تظهر في الصورة (اسم التطبيق والقسم)، ثم أعط الخطوة الدقيقة انطلاقًا من هذه الشاشة بالذات — سمِّ الزر أو الخيار الظاهر في الصورة حرفيًا الذي يضغطه المستخدم، وإذا كان المطلوب غير موجود في هذه الشاشة قل له بوضوح: «هذا غير موجود هنا، ارجع/ادخل على …» بخطوة واحدة محددة. ممنوع سرد كل الطرق والأماكن الممكنة — طريق واحد دقيق فقط.\n3ب) إذا أعاد المستخدم إرسال نفس الصورة بعد إجابة سابقة فمعناها أن إجابتك ما كانت دقيقة كفاية — ممنوع تكرار نفس الإجابة؛ دقّق في الصورة أكثر وأعطه خطوة أدق وأكثر تحديدًا، أو اسأله سؤالًا واحدًا قصيرًا يحدد وين توقف.\n4) لا تقل أبدًا "لا أستطيع رؤية الصورة" — الصورة أمامك، حلّلها مباشرة.' +
        // v604 — المشاهد والأماكن والديكور: الأربع الأولى تعطي وصفًا محايدًا بلا
        // تسمية نمط ولا تقييم ولا توصية عمليّة، وتجرّ حشوًا جنائيًّا (غياب أشخاص/علامات).
        '\n5) عند التحليل الشامل فقط: إذا كانت الصورة مكانًا أو غرفة أو ديكورًا أو واجهة أو مبنى أو حديقة أو أثاثًا أو تصميمًا معماريًا فالتقرير إلزاميًا بهذا الترتيب: ① سمِّ النمط التصميميّ باسمه المعروف (Japandi أو Minimal أو Scandinavian أو Industrial أو Boho أو Classic أو Modern Luxury أو غيره) وسبب التصنيف. ② العناصر: الأرضيّة والجدران والإضاءة ودرجة حرارتها والأثاث والأقمشة والنباتات ولوحة الألوان. ③ نقاط القوّة ثمّ ملاحظات التحسين بصراحة بلا مجاملة. ④ تقييم من 10 لكلّ بند: الفكرة العامّة، تناسق الألوان، الإضاءة، الفخامة والذوق النهائيّ. ⑤ قائمة ترقية عمليّة: من 4 إلى 6 خطوات محدّدة قابلة للتنفيذ (قطعة أو لون أو إضاءة أو نسيج) مع أثر كلّ خطوة.' +
        '\n6) ممنوع الحشو: لا تذكر غياب نصّ أو أشخاص أو علامات تجاريّة أو أطراف أجسام أو انعكاسات لا قيمة لها إلّا إذا سأل المستخدم عنها، ولا تنهِ ردّك بسؤال عن خدمة أخرى — أنهِ بالخلاصة أو التقييم.'});
    }

    // For plain questions (not app-building tasks), ground the answer in a
    // real live web search when the question looks like it needs current/
    // factual info, so providers don't guess or drift onto an unrelated
    // topic. Reuses the same Tavily/Google-backed /api/search endpoint and
    // keyword heuristic already used for مها's voice tab.
    // 📚🖼️ Feature ②: kept in the outer scope (not just this `if` block) so
    // the assistant message(s) pushed further below (single-provider reply
    // and/or Ask-All merge reply) can attach __searchData.sources /
    // __searchData.images for the ChatGPT-style image strip + source badges.
    let __searchData = null;
    // 👋 التحية اللفظية وحدها: رد قصير طبيعي بلا صيغة محفوظة.
    // سؤال المجاملة («كيف الحال؟») يبقى محادثة متصلة ولا يدخل هذا المسار.
    if(isPureGreeting(text)){
      apiMessages.push({role: 'system', content: 'رسالة المستخدم الأخيرة تحية لفظية فقط وليست سؤالًا. رحّب به ترحيبًا حارًّا راقيًا بروح المجلس فيه حضور وشخصية بلغة المستخدم — جملة أو جملتان بلا صيغة ثابتة — واسأله سؤالًا واحدًا طبيعيًّا عن حاله أو يومه. ممنوع عرض الخدمات أو الأمثلة، وممنوع فتح موضوع سابق أو استخدام الذاكرة.'});
    }
    /* v-one-brain: طبقة البحث الاستباقي في العميل حُذفت كليًا بقرار المالك.
       كانت تخمّن «هل هذا بحث؟» بمئات الأنماط وتحجز النموذج وتبحث مرتين —
       الآن عقل واحد: النموذج يقرر بنفسه ويبحث بأداته، وبطاقات «المصادر»
       تأتي من نتائج بحثه عبر حدث sources في البث. */

    // 📋 تقسيم المهام: للطلبات الكبيرة، نضع خطة خطوات ونتابعها حتى النهاية
    let __taskPlan = null, __planMsg = null;
    // 📋 v345: خطة العمل تظهر فقط في وضع «اسأل الكل» الصريح (متعدد المزودين) —
    // في وضع الكينج يبني Claude وحده، فتظل الخطة يتيمة فارغة (⬜⬜) بلا تحقّق.
    // لذلك نمنعها نهائيًا للمزود الواحد حتى لا تطلع خطة فارغة للمزودين غير Claude.
    if(__askAllExplicit && askAll && __curIsBuildTask && text.length >= 12){
      try{
        __planMsg = { role: 'assistant', content: taskTxt('planning'), providerLabel: '📋' };
        cur.messages.push(__planMsg);
        renderMessages(true);
        __taskPlan = await planBuildSteps(text);
        if(__taskPlan && __taskPlan.length >= 2){
          __planMsg.content = formatTaskPlan(__taskPlan, null);
          apiMessages.push({ role: 'system', content: 'UNIFIED BUILD BLUEPRINT - this is the single agreed spec. Every builder MUST follow it exactly (same app, same screens, same style) - do not invent a different concept:\n' + (__taskPlan.__spec || '') + 'Steps - the final single HTML file MUST implement ALL of them:\n' + __taskPlan.map((s, i) => (i + 1) + '. ' + s).join('\n') });
        } else {
          cur.messages = cur.messages.filter(m => m !== __planMsg);
          __taskPlan = null; __planMsg = null;
        }
        renderMessages(true);
      }catch(planErr){
        console.warn('[taskPlan] skipped:', planErr);
        if(__planMsg){ cur.messages = cur.messages.filter(m => m !== __planMsg); __planMsg = null; }
        __taskPlan = null;
      }
    }

    if(askAll){
      // v426 — الأربعة المعتمدون فقط يعملون بمفاتيح المالك (قرار عمران ٦ أغسطس).
      const hasClaude = localStorage.getItem('aiapp_include_claude') !== 'false';
      const hasGemini = localStorage.getItem('aiapp_include_gemini') !== 'false';
      const hasOpenAI = localStorage.getItem('aiapp_include_openai') !== 'false';
      const hasGroq = localStorage.getItem('aiapp_include_groq') !== 'false';
      const keyCount = [hasClaude, hasGemini, hasOpenAI, hasGroq].filter(Boolean).length;
      if(!customProviders && keyCount < 2){
        throw new Error(t('missingKeysAskAll'));
      }
      let providers = [];
      if(hasClaude) providers.push({ key: 'claude', label: 'Anthropic Claude' });
      if(hasGemini) providers.push({ key: 'gemini', label: 'Google Gemini' });
      if(hasOpenAI) providers.push({ key: 'openai', label: 'OpenAI' });
      if(hasGroq) providers.push({ key: 'groq', label: 'Groq' });
      const trueFullPoolKeys = providers.map(p => p.key);
      // قرار نهائي: أي بناء أو "اسأل الكل" يستخدم كل المزودين دائمًا.
      // اختيار ○/✅ الجانبي ما يقلّص القائمة أبدًا.
      // "isBuildTask" must stay in the outer function scope (not just this
      // block) because it's also used further below to decide whether any
      // code block a provider happens to return should actually replace the
      // live preview - a plain question should never touch the preview/app,
      // even if a provider's answer happens to contain a stray ``` block.
      let isBuildTask = false;
      {
        // "المدرب" smart router: silently narrow the eligible pool down to the
        // best-suited providers for this specific message. Falls back to the
        // full pool automatically on any failure - never blocks sending.
        // Any request that's clearly "build me a full app/bot/page/site" is
        // always treated as complex, regardless of what the classifier says
        // AND regardless of any earlier "continue with this provider only"
        // pin - a pin from a past simple reply should never lock a later
        // full-app request down to a single provider.
        const BUILD_TASK_RE = /بوت|تطبيق|برنامج|موقع|صفحة|لعبة|لعبه|العاب|ألعاب|أداة|اداة|نسخة|نسخه|شهادة|شهاده|بطاقة|بطاقه|دعوة|دعوه|بوستر|شعار|لوجو|تهنئة|تهنئه|\bapp\b|\bwebsite\b|\bpage\b|\bbot\b|\bgame\b|\btool\b|\bclone\b|\bcertificate\b|\bcard\b|\binvitation\b|\bposter\b|\blogo\b/i;
        isBuildTask = !__gateNoBuild && (BUILD_TASK_RE.test(text) || __strongBuildRe.test(text));
        if(__gateNoBuild){
          apiMessages.push({ role: 'system', content: 'المستخدم طلب بناء شيء. ممنوع أن تبنيه الآن. ردّ بنصّ محادثة فقط بلا أيّ كتلة كود: اذكر في سطرين إلى ثلاثة ماذا ستبني بالضبط (الأقسام الرئيسية + أنّك سترسم الصور بنفسك)، ثمّ اختم بسؤال واحد فقط: «تبيني أبدأ البناء الحين؟». لا تبدأ البناء حتّى يوافق المستخدم في رسالته التالية.' });
          // 💰 دور البوابة = وصف قصير فقط — مزود واحد يكفي بدل التسعة (توفير).
          const __gateOne = ['claude', 'gemini', 'groq'].find(k => providers.some(p => p.key === k));
          if(__gateOne) providers = providers.filter(p => p.key === __gateOne);
        }
        if(isBuildTask){
          // Hard rule: in a build turn every provider must BUILD immediately -
          // never reply with just an idea/plan or ask "shall I start?".
          apiMessages.push({ role: 'system', content: 'This turn is a BUILD request. You MUST return the complete, fully working app NOW as one single ```html code block in this same reply. Never reply with only an idea, a plan, or a question like "shall I start building?" - build it immediately and completely.' });
        }
        const fullPoolKeys = isBuildTask ? trueFullPoolKeys : providers.map(p => p.key);
        if(fullPoolKeys.length > 1){
          if(isBuildTask){
            // البناء الافتراضي: Claude Sonnet 4 بكامل قوته لوحده — نفس نموذج claude.ai
            // بالضبط، بدون دمج يخفف الجودة. كتابة "اسأل الكل" صراحةً ترجع دمج الكل.
            let forced;
            if(__askAllExplicit){
              // 🎯 "كل واحد ودوره": بدل ما التسعة يبنون نفس الشي، نختار فرقة
              // المتخصصين حسب نوع الطلب — أسرع وأرخص وأجود. Groq يظل المخطط
              // (planBuildSteps) وClaude يظل المهندس الرئيسي للدمج.
              const __DESIGN_RE = /شهادة|شهاده|بطاقة|بطاقه|دعوة|دعوه|بوستر|لوجو|شعار|بنر|غلاف|إعلان|اعلان|تهنئة|تهنئه|منشور|certificate|card|invitation|poster|logo|banner|cover|flyer/i;
              const __GAME_RE = /لعبة|لعبه|العاب|ألعاب|\bgame\b/i;
              let squad;
              if(__DESIGN_RE.test(text)){
                // فرقة التصميم: الأقوى بصريًا
                squad = ['gemini', 'claude', 'openai'];
              } else if(__GAME_RE.test(text)){
                // فرقة الألعاب: منطق + رسوميات
                squad = ['claude', 'openai', 'gemini'];
              } else {
                // فرقة التطبيقات والمواقع
                squad = ['claude', 'openai', 'gemini', 'groq'];
              }
              forced = squad.filter(k => fullPoolKeys.includes(k));
              if(forced.length < 2) forced = fullPoolKeys.slice();
            } else if(customProviders && customProviders.length && customProviders.some(k => fullPoolKeys.includes(k))){
              // المستخدم اختار ✅ مزودًا معيّنًا → طلبات البناء التالية تروح له هو
              // (وليس Claude الافتراضي) حتى يلغي الاختيار أو يكتب "اسأل الكل".
              forced = customProviders.filter(k => fullPoolKeys.includes(k));
            } else if(fullPoolKeys.includes('claude')){
              forced = ['claude'];
            } else {
              forced = ['claude', 'openai', 'gemini'].filter(k => fullPoolKeys.includes(k)).slice(0, 1);
            }
            if(forced.length >= 1){
              providers = forced.map(k => ({ key: k, label: functionalLabel(k) }));
            }
          } else if(customProviders && customProviders.length){
            // "أكمل مع هذا المزود" — للسؤال العادي فقط: نستخدم المزودين
            // المختارين ✅ فقط بدل الكل. البناء الكامل ما يتأثر بالاختيار.
            const picked = providers.filter(p => customProviders.includes(p.key));
            if(picked.length) providers = picked;
          }
        }
      }

      // Show every provider's bubble immediately (no waiting for the slowest
      // one) and stream each provider's text into its own bubble live, word
      // by word, as soon as it arrives - same spirit as single-provider mode.
      // ✏️ مزود واحد مختار ✅ + طلب تعديل → الكود الراجع يُطبَّق مباشرة على
      // المعاينة (مثل وضع المزود الواحد العادي) بدل أن يبقى حبيس الفقاعة.
      const __pinEditRe = /(عدل|عدّل|غير|غيّر|ضيف|أضف|اضف|حط|زيد|زد|كبر|كبّر|صغر|صغّر|لون|لوّن|بدل|بدّل|احذف|امسح|ازل|أزل|صلح|أصلح|اصلح|طور|طوّر|حدث|حدّث|كمل|أكمل|اكمل|خل|اجعل|رتب|حسن|حسّن|\badd\b|\bchange\b|\bedit\b|\bfix\b|\bupdate\b|\bimprove\b|\bremove\b|\bmake\b|\bset\b)/i;
      const __applyCode = isBuildTask || (providers.length === 1 && !!cur.code && __pinEditRe.test(text));
      const askAllBatchId = 'batch' + (++askAllUidCounter);
      const placeholders = providers.map(p => {
        const msg = {role: 'assistant', content: '', providerLabel: p.label, providerKey: p.key, askAllReply: true, code: null, _loading: true, _uid: ++askAllUidCounter, batchId: askAllBatchId};
        cur.messages.push(msg);
        return msg;
      });
      // Show one visible "preparing best result" bubble immediately so the
      // user always sees feedback while the 9 providers work silently in the
      // background - it's removed the instant the real merge bubble appears.
      // 🎯 مزود واحد فقط (اختيار ✅) → رده يظهر مباشرة بدون فقاعة تجهيز ولا دمج.
      const prepMsg = { role: 'assistant', content: '🧠 ' + t('preparingBestResult'), providerLabel: '', code: null, _loading: true, _uid: ++askAllUidCounter, isAskAllPrep: true, batchId: askAllBatchId };
      if(providers.length > 1) cur.messages.push(prepMsg);
      renderMessages(true);

      let autoApplied = false;
      // Gently smooth out how fast each Ask-All bubble's text appears, so it
      // doesn't all pop in at once - a light typewriter feel rather than a
      // raw network-speed dump.
      const revealStates = new Map();
      /* v-reveal-slow (طلب عمران ٣١ أغسطس: «اريد سرعة المحادثة بطيئة»):
         الوتيرة المتسارعة السابقة (v-reveal-fast) كانت تلحق البث خلال نصف
         ثانية فيظهر الرد دفعة واحدة تقريبًا. رجعنا لإحساس الكتابة الهادئ
         ~66 حرفًا بالثانية، مع تسريع فقط عند تراكم يفوق 1200 حرف حتى لا
         يقضي ردٌّ طويل جدًا دقيقة كاملة «يتكتب» بعد اكتماله. */
      const REVEAL_TICK_MS = 30;
      const __revealStep = (st) => {
        const left = st.target.length - st.shown;
        return left > 1200 ? Math.ceil(left / 300) : 2;
      };
      const ensureRevealTimer = (msg) => {
        let st = revealStates.get(msg._uid);
        if(!st){
          st = { target: '', shown: 0, done: false, timer: null };
          revealStates.set(msg._uid, st);
        }
        if(!st.timer){
          st.timer = setInterval(() => {
            if(st.shown < st.target.length){
              st.shown = Math.min(st.target.length, st.shown + __revealStep(st));
              // v310: msg.content يحمل النص الكامل دائمًا — الحركة عرض فقط.
              // قبل: كان يُحفظ المقطع الجزئي، ولو سُكِّر التطبيق قبل نهاية
              // الحركة ينحفظ الرد مقطوعًا للأبد (سبب الردود الناقصة بالآيفون).
              msg.content = st.target;
              const el = messagesEl.querySelector('[data-askuid="' + msg._uid + '"]');
              // strip ** أثناء الحركة حتى لا يظهر الماركداون خامًا للمستخدم
              if(el) el.textContent = st.target.slice(0, st.shown).replace(/\*\*/g, '');
              // v610 — الحركة تكتب النصّ خامًّا بـtextContent، فروابط الماركداون
              // تبقى عارية حتّى الرسم النهائيّ. ولو بُتر الردّ أو تعطّل الإنهاء
              // لم يأتِ ذلك الرسم أبدًا فبقيت خامًا (عيب رآه عمران). عند لحاق
              // الحركة نعيد الرسم المصيَّر مرّة واحدة، ونعيده متى زاد النصّ.
              if(st.shown >= st.target.length && !st._flushed){ st._flushed = 1; renderMessages(true); }
            } else if(st.done){
              clearInterval(st.timer);
              st.timer = null;
              revealStates.delete(msg._uid);
              renderMessages(true);
              saveState();
            }
          }, REVEAL_TICK_MS);
        }
        return st;
      };
      // 📊 عداد تقدم حي على فقاعة التحضير: المستخدم يشوف (4/9) بدل فقاعة
      // صامتة تبدو معلقة — يعرف أن المزودين يشتغلون فعلًا.
      const __prepStartTs = Date.now();
      const __updatePrepCounter = () => {
        if(providers.length > 1 && cur.messages.includes(prepMsg) && prepMsg._loading){
          const doneCount = placeholders.filter(m => !m._loading).length;
          const __el = Math.floor((Date.now() - __prepStartTs) / 1000);
          const __mm = Math.floor(__el / 60), __ss = String(__el % 60).padStart(2, '0');
          prepMsg.content = '🧠 ' + t('preparingBestResult') + ' (' + doneCount + '/' + providers.length + ') ⏱️ ' + __mm + ':' + __ss;
          renderMessages(true);
        }
      };
      // ⏱️ مؤقت مباشر كل ثانيتين حتى يعرف المستخدم أن العملية حية وليست معلقة.
      const __prepTicker = setInterval(() => {
        try{
          if(!prepMsg._loading || !cur.messages.includes(prepMsg)){ clearInterval(__prepTicker); return; }
          __updatePrepCounter();
        }catch(e){ clearInterval(__prepTicker); }
      }, 2000);
      const finalizeOne = (msg) => {
        msg._loading = false;
        if(isBuildTask && !__gateNoBuild && !msg.code && !msg._failed && !msg._noCode){ msg._noCode = 1; msg.content = (msg.content ? msg.content + '\n\n' : '') + t('buildNoCode'); }
        try{ __updatePrepCounter(); }catch(e){ __swallow(e, "misc:app-09-attach#21"); }
        const st = revealStates.get(msg._uid);
        if(st){
          st.target = msg.content;
          st._flushed = 0; // v610 — نصّ جديد يستحقّ رسمًا مصيَّرًا جديدًا
          st.done = true;
          ensureRevealTimer(msg);
          // v310: حفظ فوري للرد الكامل — لا ننتظر نهاية حركة الكتابة.
          try{ saveState(); }catch(e){ __swallow(e, "save:app-09-attach#22"); }
        } else {
          renderMessages(true);
          saveState();
        }
      };
      // ⏱️ حارس التعليق: أي نداء ما يرسل ولا حرف جديد خلال stallMs، أو يتجاوز
      // hardMs بالكامل، يُعتبر فاشلًا فورًا بدل ما يعلّق الصفحة إلى ما لا نهاية.
      const callWithWatchdog = (key, msgs, onDelta, stallMs, hardMs) => new Promise((resolve, reject) => {
        let done = false, lastTick = Date.now();
        const start = Date.now();
        const iv = setInterval(() => {
          if(done) { clearInterval(iv); return; }
          if(Date.now() - lastTick > stallMs || Date.now() - start > hardMs){
            done = true; clearInterval(iv);
            const e = new Error('انتهت مهلة المزود (توقف عن الرد)'); e.status = 408;
            reject(e);
          }
        }, 5000);
        callProviderAI(key, msgs, (t) => { lastTick = Date.now(); if(!done && onDelta) onDelta(t); })
          .then(v => { if(!done){ done = true; clearInterval(iv); resolve(v); } },
                e => { if(!done){ done = true; clearInterval(iv); reject(e); } });
      });
      const streamOne = async (p, msg) => {
        const onDelta = (partial) => {
          const st = ensureRevealTimer(msg);
          // ✂️ لا يظهر الكود الخام في فقاعة المحادثة أثناء البث أبدًا
          const stripped = liveStripCode(partial);
          if(st.target && stripped.length < st.target.length) st.shown = Math.min(st.shown, Math.max(0, stripped.length - 1));
          st.target = stripped;
          st._flushed = 0; // v610 — نصّ جديد يستحقّ رسمًا مصيَّرًا جديدًا
        };
        try{
          const reply = await callWithWatchdog(p.key, apiMessages, onDelta, 75000, 360000);
          var __chatVideo = window.__chatVideoResult;
          if (__chatVideo && __chatVideo.url) {
            msg.attachments = (msg.attachments || []).concat([{ isVideo: true, url: __chatVideo.url, name: __chatVideo.name || 'chat-video.mp4', mime: 'video/mp4' }]);
            window.__chatVideoResult = null;
          }
          let { code, explanation } = extractReply(reply);
          // 🔁 v326: مهمة بناء/تصميم رجعت نصًا بلا أي كود (مثل «تمام، هذا
          // لوجو دعائي كامل» والمعاينة فاضية) → إعادة الطلب مرة وحدة بأمر
          // صارم يلزم المزود يرجع الملف الكامل.
          if(!code && isBuildTask && !__gateNoBuild){
            try{
              msg.content = '';
              const __strictMsgs = apiMessages.concat([{ role: 'system', content: 'FINAL STRICT ORDER: your previous reply contained NO code block — that counts as a FAILED answer. Reply NOW with the COMPLETE finished design/app as ONE single ```html code block (the full file from <!DOCTYPE html> to </html>, nothing omitted). Claiming it is done without code is FORBIDDEN. Text-only replies are FORBIDDEN.' }]);
              const __strictReply = await callWithWatchdog(p.key, __strictMsgs, onDelta, 75000, 180000);
              const __r2 = extractReply(__strictReply);
              if(__r2.code){ code = __r2.code; explanation = __r2.explanation; }
            }catch(e){ __swallow(e, "misc:app-09-attach#23"); }
          }
          msg.content = (__applyCode ? stripCodeFromChat(explanation) : explanation) || (code ? t('buildSuccess') : '');
          msg.code = code || null;
          if(code && __applyCode && !autoApplied){
            cur.code = code;
            msg.autoApplied = true;
            autoApplied = true;
          }
          finalizeOne(msg);
        }catch(err){
          if(err && err.name === 'AbortError') throw err;
          // In "Ask All" mode every provider is already being tried in parallel,
          // so there is no other provider left to fall back to. Instead, a 429
          // (rate limit) is very often transient - especially for shared
          // free-tier keys like OpenRouter's - so retry the *same* provider a
          // couple of times with a short backoff before giving up.
          if(err && (err.status === 429 || err.status === 402)){
            // OpenRouter's free tier is rate-limited per-minute (not a hard
            // daily quota), and in "Ask All" mode every other provider key is
            // already in use, so there is no alternate provider to fall back
            // to. Use a longer backoff instead of giving up immediately.
            const delays = (p.key === 'openrouter') ? [15000, 30000] : [2500, 5000];
            for(const delay of delays){
              await new Promise(r => setTimeout(r, delay));
              try{
                msg.content = '';
                const retryReply = await callWithWatchdog(p.key, apiMessages, onDelta, 60000, 150000);
                const { code, explanation } = extractReply(retryReply);
                msg.content = (__applyCode ? stripCodeFromChat(explanation) : explanation) || (code ? t('buildSuccess') : '');
                msg.code = code || null;
                if(code && __applyCode && !autoApplied){
                  cur.code = code;
                  msg.autoApplied = true;
                  autoApplied = true;
                }
                finalizeOne(msg);
                return;
              }catch(retryErr){
                if(retryErr && retryErr.name === 'AbortError') throw retryErr;
                err = retryErr;
                if(!(retryErr && (retryErr.status === 429 || retryErr.status === 402))) break;
              }
            }
            // Still failing after retries - try ONE different provider not
            // already included in this "Ask All" batch (single attempt only;
            // do NOT chain through the whole fallback order, since if the
            // account is rate-limited across the board that turns into a
            // multi-minute cascade of 429s).
            const triedKeys = new Set(providers.map(pp => pp.key));
            const altKey = AUTO_FALLBACK_ORDER.find(k => !triedKeys.has(k));
            if(altKey){
              try{
                msg.content = '';
                const altReply = await callWithWatchdog(altKey, apiMessages, onDelta, 60000, 120000);
                const { code, explanation } = extractReply(altReply);
                msg.content = (__applyCode ? stripCodeFromChat(explanation) : explanation) || (code ? t('buildSuccess') : '');
                msg.code = code || null;
                msg.providerLabel = '🔄 ' + functionalLabel(altKey);
                msg.providerKey = altKey;
                if(code && __applyCode && !autoApplied){
                  cur.code = code;
                  msg.autoApplied = true;
                  autoApplied = true;
                }
                finalizeOne(msg);
                return;
              }catch(altErr){
                if(altErr && altErr.name === 'AbortError') throw altErr;
                if(!(altErr && (altErr.status === 429 || altErr.status === 402))) err = altErr;
              }
            }
          }
          msg._failed = true;
          msg.content = '⚠️ ' + msg.providerLabel + ': ' + __friendlyErr(err);
          finalizeOne(msg);
        }
      };

      // 🚦 حد التزاحم: المتصفح يسمح بـ~6 اتصالات متزامنة لنفس النطاق فقط.
      // إطلاق 9 بثوث دفعة واحدة كان يخنق الزائد عن الحد (يفشل بـ"توقف عن
      // الرد") ويحشر نداء الدمج النهائي خلفهم. التشغيل بمجموعات من 5 يضمن
      // اتصالًا حقيقيًا لكل مزود وطريقًا فاضيًا للمهندس الرئيسي بعدهم.
      let __poolIdx = 0;
      const __poolWorker = async () => {
        while(__poolIdx < providers.length){
          const __i = __poolIdx++;
          try{ await streamOne(providers[__i], placeholders[__i]); }
          catch(e){ if(e && e.name === 'AbortError') throw e; }
        }
      };
      const settled = await Promise.allSettled(Array.from({ length: Math.min(5, providers.length) }, () => __poolWorker()));
      if(genAbortController && genAbortController.signal.aborted){
        // User cancelled while "ask all" was mid-flight: skip showing any of
        // these results and let the outer catch restore the message for editing.
        const abortErr = new Error('aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      // If any provider genuinely rejected for a reason other than abort
      // (already handled/logged inline above), nothing further to do here -
      // each bubble already shows its own success/error text.
      void settled;

      // إخفاء المزودين الفاشلين بهدوء: إذا نجح مزوّد واحد على الأقل، تُحذف
      // فقاعات الأخطاء (429/422/...) نهائيًا بدل إزعاج المستخدم برسائل تحذير.
      {
        const __okCount = placeholders.filter(m => !m._failed).length;
        if(__okCount > 0){
          let __removed = false;
          for(const m of placeholders){
            if(m._failed){
              const i = cur.messages.indexOf(m);
              if(i !== -1){ cur.messages.splice(i, 1); __removed = true; }
            }
          }
          if(__removed){ renderMessages(true); saveState(); }
        }
      }

      // After every provider has answered, synthesize all the successful
      // replies into one unified, de-duplicated answer using a single
      // strong provider - so the user gets one clean final answer in
      // addition to the individual per-provider bubbles above.
      const usableAnswers = placeholders
        .filter(m => m.content && !m.content.startsWith('⚠️'))
        .map(m => ({ label: m.providerLabel, text: m.content, code: m.code, codeType: m.codeType }));
      {
        const prepIdx = cur.messages.indexOf(prepMsg);
        if(prepIdx !== -1) cur.messages.splice(prepIdx, 1);
      }
      if(providers.length > 1 && (usableAnswers.length >= 2 || (isBuildTask && usableAnswers.length === 1 && usableAnswers[0].code))){
        const mergeMsg = { role: 'assistant', content: '', providerLabel: '🧠 ' + t('mergedAnswerLabel'), code: null, _loading: true, _uid: ++askAllUidCounter, isMergeHeader: true, batchId: askAllBatchId, batchCount: usableAnswers.length,
          // ✅ v535: عادت المصادر والصور إلى المحادثة. إطفاء v368 كان مؤقّتًا
          // بانتظار «المتصفح» — وقد أُلغي المتصفح نهائيًّا، فلا سبب للإخفاء.
          sources: (__searchData && __searchData.sources) || undefined,
          searchImages: (__searchData && __searchData.images) || undefined };
        cur.messages.push(mergeMsg);
        renderMessages(true);
        // Only treat this as a code-merge (which would overwrite the live
        // preview/app) when the user actually asked to build something this
        // turn. A provider occasionally echoes a stray ``` code block inside
        // an otherwise plain answer - that must never hijack the preview.
        const hasAnyCode = usableAnswers.length >= 2 && usableAnswers.some(a => a.code);
        const mergeOrder = ['claude', 'openai', 'gemini', ...AUTO_FALLBACK_ORDER];
        let mergeDone = false;
        try{
        if(hasAnyCode){
          // 🧩 نهج جديد (أساس + تعزيز): بدل خلط 4 أكواد كاملة (كان يفشل دائمًا)،
          // نأخذ أفضل نسخة كاملة كأساس، نستخرج المميزات التي انفردت بها النسخ
          // الأخرى، ثم نطلب من نموذج قوي إضافتها على الأساس - فتكون النتيجة
          // فعليًا أقوى من أي مزود منفرد.
          const looksCompleteCode = (code, type) => {
            if(!code) return false;
            const ty = (type || '').toLowerCase();
            if(ty.includes('html') || /<html[\s>]/i.test(code)) return /<\/html>\s*$/i.test(code.trim());
            return true;
          };
          const __rankScore = (a) => {
            if(!a.code) return -1;
            let s = a.code.length;
            try{ if(looksCompleteCode(a.code, a.codeType)) s += 1000000; }catch(e){ __swallow(e, "misc:app-09-attach#24"); }
            return s;
          };
          const __cands = usableAnswers.filter(a => a.code).sort((x, y) => __rankScore(y) - __rankScore(x));
          const __base = __cands[0];
          const __others = __cands.slice(1, 5);
          const __useBaseAsIs = () => {
            mergeMsg.providerLabel = '🏆 أفضل نسخة (' + (__base.label || '') + ')';
            mergeMsg.content = t('buildSuccess');
            mergeMsg.code = __base.code;
            mergeMsg.codeType = __base.codeType;
            cur.code = __base.code;
            cur.codeType = __base.codeType;
            mergeDone = true;
          };
          // 🧠 نهج Mixture of Agents: "المهندس الرئيسي" يقرأ أفضل المقترحات
          // كاملة + مقتطفات أفكار من الباقين، ثم يعيد كتابة نسخة نهائية
          // واحدة متفوقة من الصفر — مو لصق ميزات، إعادة بناء واعية.
          if(__cands.length < 2){
            __useBaseAsIs();
          } else {
            const __top = __cands.slice(0, 3);
            const __rest = __cands.slice(3, 8);
            const __budget = 110000;
            let __used = 0;
            const __parts = [];
            for(const a of __top){
              const __cap = Math.min(a.code.length, 40000, Math.max(0, __budget - __used));
              if(__cap <= 0) break;
              const chunk = a.code.slice(0, __cap);
              __used += chunk.length;
              __parts.push('### مقترح كامل (' + a.label + ')' + (chunk.length < a.code.length ? ' — (مقتطع)' : '') + '\n```' + (a.codeType || '') + '\n' + chunk + '\n```');
            }
            for(const a of __rest){
              if(__used > __budget) break;
              const chunk = a.code.slice(0, 3000);
              __used += chunk.length;
              __parts.push('### مقتطف أفكار إضافية (' + a.label + ')\n```\n' + chunk + '\n```');
            }
            const __lastUserMsg = (apiMessages.filter(m => m.role === 'user').slice(-1)[0] || {}).content || '';
            const __moaSystem = APP_IDENTITY_NOTE + BUILD_COMPLETENESS_RULE + DESIGN_POSTER_RULE + NO_FAKE_EDIT_RULE + CHAT_STYLE_RULE +
              '\n\nأنت المهندس الرئيسي والمدمج الذكي لفريق من نماذج ذكاء اصطناعي متعددة. أمامك مقترحات متعددة لنفس طلب المستخدم. مهمتك: حلّل المقترحات، وخذ أجمل تصميم وأقوى منطق وكل ميزة مفيدة ظهرت في أي مقترح، وتخلّص من الأخطاء والتكرار، ثم اكتب النسخة النهائية الواحدة فائقة الجودة كاملة من أول سطر إلى آخر سطر. يجب أن تكون النتيجة أفضل وأكمل من أي مقترح منفرد. أعد كودًا واحدًا كاملًا قابلًا للتشغيل داخل fence واحد، بدون شرح خارج الصندوق، وبدون اختصار أو وضع تعليقات بدل الكود.';
            const __moaUser = 'طلب المستخدم الأصلي: "' + String(__lastUserMsg).slice(0, 2000) + '"\n\n' + __parts.join('\n\n') + '\n\nاكتب الآن النسخة النهائية الكاملة المتفوقة.';
            const __mergePhaseStart = Date.now();
            for(const mKey of ['gemini', 'claude', 'openai']){
              if(mergeDone) break;
              if(Date.now() - __mergePhaseStart > 480000) break;
              try{
                const __reply = await callWithWatchdog(mKey, [
                  { role: 'system', content: __moaSystem },
                  { role: 'user', content: __moaUser }
                ], () => {}, 60000, 240000);
                const { code: __mc, codeType: __mct, explanation: __mex } = extractReply(__reply || '');
                if(!(__mc && looksCompleteCode(__mc, __mct) && __mc.length >= __base.code.length * 0.75)){
                  console.warn('[MoA] rejected from ' + mKey + ': len=' + (__mc ? __mc.length : 0) + ' base=' + __base.code.length + ' complete=' + (__mc ? looksCompleteCode(__mc, __mct) : false));
                }
                if(__mc && looksCompleteCode(__mc, __mct) && __mc.length >= __base.code.length * 0.75){
                  mergeMsg.providerLabel = '🧠 نسخة الفريق النهائية';
                  mergeMsg.content = stripCodeFromChat(__mex) || t('buildSuccess');
                  mergeMsg.code = __mc;
                  mergeMsg.codeType = __mct || __base.codeType;
                  cur.code = __mc;
                  cur.codeType = mergeMsg.codeType;
                  mergeDone = true;
                }
              }catch(mergeErr){ console.warn('[MoA] master ' + mKey + ' failed:', mergeErr && mergeErr.message); if(mergeErr && mergeErr.name === 'AbortError') break; }
            }
            if(!mergeDone) __useBaseAsIs();
          }
        } else {
          const mergePrompt = usableAnswers.map((a, i) => '### ' + t('mergedAnswerSourceLabel') + ' ' + (i + 1) + ' (' + a.label + ')\n' + a.text).join('\n\n');
          const mergeMessages = [
            { role: 'system', content: t('mergedAnswerSystemPrompt') + '\n[قاعدة إلزامية]: أثناء الدمج ممنوع حذف أي بيانات ملموسة وردت في الإجابات: روابط الإعلانات المباشرة، الأسعار، أرقام الهواتف، أسماء المناطق. إذا احتوت الإجابات على إعلانات حقيقية (عقارات/سيارات/وظائف) بروابط، اعرضها في الإجابة النهائية كقائمة منظمة: العنوان + السعر + المنطقة + الرابط المباشر — ممنوع استبدالها بنصيحة عامة مثل "ادخل الموقع وابحث".' + APP_IDENTITY_NOTE + CONVERSATION_QUALITY_RULE + CHAT_STYLE_RULE },
            ...apiMessages.filter(m => m.role !== 'system'),
            { role: 'user', content: mergePrompt }
          ];
          for(const mKey of mergeOrder){
            if(mergeDone) break;
            try{
              const mergedReply = await callProviderAI(mKey, mergeMessages, () => {});
              // This branch is for plain Q&A merging (not a build task), so
              // even if a provider slipped a ```code``` fence into its
              // answer, we must never show raw code in the chat bubble here
              // - strip it out and keep only the natural-language explanation.
              const { explanation: mergedExplanation } = extractReply(mergedReply || '');
              mergeMsg.content = (mergedExplanation && mergedExplanation.trim()) ? mergedExplanation : mergedReply;
              mergeDone = true;
            }catch(mergeErr){
              if(mergeErr && mergeErr.name === 'AbortError') break;
            }
          }
        }
        }catch(outerMergeErr){
          console.error('[askAll merge] unexpected error:', outerMergeErr);
        }
        // Safety net: no matter what happened above (success, checklist
        // rejection, or an unexpected error we didn't anticipate), the user
        // must always see a concrete final state here - never a failure
        // message. If a real merge never completed, fall back to the
        // strongest individual answer already collected above instead of
        // showing an error - the user always gets a usable final result.
        mergeMsg._loading = false;
        // 🔒 ضمانة: في مهمة بناء، الرسالة النهائية لازم يظهر معها زر
        // "استخدم هذا الإصدار" دائمًا - حتى لو الدمج رجع نصًا بدون كود
        // مرفق، نربط أفضل كود متاح (المطبّق حاليًا أو أول نسخة ناجحة).
        if(!mergeMsg.code && (isBuildTask || usableAnswers.some(a => a.code))){
          const bestCodeAns = usableAnswers.find(a => a.code);
          const fallbackCode = (bestCodeAns && bestCodeAns.code) || cur.code;
          if(fallbackCode){
            mergeMsg.code = fallbackCode;
            mergeMsg.codeType = cur.codeType || (bestCodeAns && bestCodeAns.codeType) || 'html';
            if(!cur.code){ cur.code = fallbackCode; cur.codeType = mergeMsg.codeType; }
          }
        }
        if(!mergeMsg.code && !(mergeMsg.content && mergeMsg.content.trim())){
          const bestText = usableAnswers.filter(a => !a.code).sort((a, b) => (b.text || '').length - (a.text || '').length)[0];
          if(bestText && bestText.text){
            mergeMsg.content = bestText.text;
          } else {
            const bestCodeAns = usableAnswers.find(a => a.code) || null;
            if(bestCodeAns){
              mergeMsg.content = t('buildSuccess');
              mergeMsg.code = bestCodeAns.code;
              mergeMsg.codeType = bestCodeAns.codeType;
              cur.code = bestCodeAns.code;
              cur.codeType = bestCodeAns.codeType;
            } else {
              mergeMsg.content = '⚠️ ' + t('mergedAnswerFailed');
            }
          }
        }
        if(mergeMsg.code){
          // 🔁 التصحيح الذاتي: فحص الكود المدموج وإصلاح أخطائه قبل العرض
          try{
            // ⏱️ سقف زمني: الإصلاح الذاتي ما يحبس النتيجة النهائية أبدًا —
            // إذا تجاوز 120 ثانية نعرض الكود كما هو (وهو أصلًا كامل وصالح).
            const healed = await Promise.race([
              selfHealCode(mergeMsg.code, mergeMsg.codeType, () => {
                mergeMsg.content = t('selfHealing');
                renderMessages(true);
              }),
              new Promise(res => setTimeout(() => res(null), 120000))
            ]);
            if(healed && healed !== mergeMsg.code){
              mergeMsg.code = healed;
              cur.code = healed;
            }
            if(mergeMsg.content === t('selfHealing')) mergeMsg.content = t('buildSuccess');
          }catch(healErr){ console.warn('[selfHeal] skipped:', healErr); }
          // 📋 تقسيم المهام: التحقق من إنجاز كل خطوة، وإكمال الناقص تلقائيًا
          if(__taskPlan && __planMsg){
            try{
              __planMsg.content = formatTaskPlan(__taskPlan, null) + '\n\n' + taskTxt('verifying');
              renderMessages(true);
              let done = await verifyBuildSteps(mergeMsg.code, __taskPlan);
              // بناء متعدد المراحل حقيقي: كل شاشة/ميزة ناقصة تُبنى في نداء مستقل
              // فوق الكود الحالي، مع تحديث ⬜→✅ مباشرة أمام المستخدم.
              let __refineBudget = 6;
              if(done && done.some(d => !d)){
                for(let i = 0; i < __taskPlan.length && __refineBudget > 0; i++){
                  if(done[i]) continue;
                  __planMsg.content = formatTaskPlan(__taskPlan, done) + '\n\n' + taskTxt('refining') + ' — ' + __taskPlan[i];
                  renderMessages(true);
                  __refineBudget--;
                  try{
                    const refMsgs = [
                      { role: 'system', content: 'You are a senior developer. You receive a complete single-file HTML app and ONE missing feature/screen to add. Return the FULL updated HTML file inside a single ```html fence. Keep all existing code exactly the same - only ADD the missing feature as a beautiful, fully working screen with realistic demo data and working navigation to/from it. No explanations outside the fence.' },
                      { role: 'user', content: 'Missing feature/screen to add now:\n' + __taskPlan[i] + '\n\nCode:\n```html\n' + mergeMsg.code + '\n```' }
                    ];
                    const r = await callAIWithFallback(refMsgs, () => {});
                    const ref = extractReply((r && r.reply) || '');
                    if(ref.code && ref.code.length > mergeMsg.code.length * 0.7){
                      mergeMsg.code = ref.code;
                      cur.code = ref.code;
                      done[i] = true;
                      renderAll(true);
                    }
                  }catch(refErr){ console.warn('[taskPlan refine] step failed:', refErr); }
                }
                // تحقق نهائي صادق: ما نعلّم ✅ إلا المنجز فعلاً
                try{
                  const recheck = await verifyBuildSteps(mergeMsg.code, __taskPlan);
                  if(recheck) done = done.map((d, i) => d || recheck[i]);
                }catch(e){ __swallow(e, "misc:app-09-attach#25"); }
              }
              __planMsg.content = formatTaskPlan(__taskPlan, done);
            }catch(taskErr){
              console.warn('[taskPlan verify] skipped:', taskErr);
              __planMsg.content = formatTaskPlan(__taskPlan, null);
            }
          }
          renderAll(true);
          if(window.innerWidth <= 860 && localStorage.getItem('previewEnabled') !== 'off'){
            switchWorkTab('preview');
            setTimeout(() => openDrawer($('#workarea')), 200);
          }
        } else {
          renderMessages(true);
        }
        saveState();
      } else {
        // Fewer than 2 usable answers - merging isn't useful, so just reveal
        // whichever individual bubble(s) came back instead of showing nothing.
        if(!cur.expandedAskAllBatches.includes(askAllBatchId)) cur.expandedAskAllBatches.push(askAllBatchId);
        renderMessages(true);
        saveState();
      }
    } else {
      // فقاعة واحدة من الانتظار حتى آخر كلمة: ننسّق Markdown المكتمل داخل
      // البث نفسه، ونأخذ قرار متابعة التمرير قبل أن يكبر الرد.
      /* v-reveal-live (طلب عمران ٢ سبتمبر: «اريده الرد مرتب تدريجى»):
         فقاعة المزود الواحد كانت ترسم النص بسرعة الشبكة — دفعات كبيرة تقفز
         دفعة واحدة فيبدو الرد مكوَّمًا لا متدرّجًا. الآن نفس إحساس الكتابة
         الهادئ المعتمد في Ask-All (~66 حرفًا بالثانية، مع تسارع عند تراكم
         يفوق 1200 حرف)، والتنسيق حيّ عبر renderStreamingAssistant فيظهر
         الرد مرتّبًا تدريجيًّا. الحركة عرضٌ فقط: النص الكامل محفوظ دائمًا. */
      const __live = { target: '', shown: 0, timer: null, done: false, waiters: [], _mLast: 0 };
      const __liveRender = () => {
        const shownTxt = __live.target.slice(0, __live.shown);
        if(!document.documentElement.classList.contains('mobile-ui')){
          const __followReply = typeof chatIsNearBottom === 'function' ? chatIsNearBottom() : true;
          renderStreamingAssistant(thinkingDiv, shownTxt);
          smartScrollBottom(__followReply);
        } else {
          // الجوال ينسّق حيًّا كسطح المكتب، مع كبح لإعادة البناء كل ١٥٠مل
          // حفاظًا على أداء الجوال.
          const __now = Date.now();
          if(__now - __live._mLast >= 150 || __live.shown >= __live.target.length){
            __live._mLast = __now;
            renderStreamingAssistant(thinkingDiv, shownTxt);
          }
          try{
            const __mobileGap = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
            if(__mobileGap < 140) messagesEl.scrollTop = messagesEl.scrollHeight;
          }catch(e){ __swallow(e, "misc:app-09-attach#26-mobile"); }
        }
      };
      const __liveTimer = () => {
        if(__live.timer) return;
        __live.timer = setInterval(() => {
          // الفقاعة أُزيلت (إيقاف/خطأ) → الحركة تنتهي بصمت ولا تعلّق شيئًا.
          if(!thinkingDiv.isConnected){ __live.shown = __live.target.length; __live.done = true; }
          if(__live.shown < __live.target.length){
            const left = __live.target.length - __live.shown;
            /* v-reveal-quick (شكوى المالك: «الردود بطيئة جدًا»): وتيرة ٦٦ حرفًا
               بالثانية كانت تمطّط ردًّا عاديًّا ١٢+ ثانية. الآن ~١٦٦ حرفًا
               بالثانية — يبقى الإحساس التدريجي المرتب بلا انتظار ممل — مع
               لحاق سريع متى تراكم البث فوق ٤٠٠ حرف. */
            __live.shown = Math.min(__live.target.length, __live.shown + (left > 400 ? Math.ceil(left / 120) : 5));
            __liveRender();
          } else if(__live.done){
            clearInterval(__live.timer);
            __live.timer = null;
            __live.waiters.splice(0).forEach((fn) => fn());
          }
        }, 30);
      };
      // بعد اكتمال البث ننتظر الحركة تلحق آخر حرف (بسقف أمان) قبل الرسم
      // النهائي — وإلا قفز باقي الرد دفعة واحدة وضاع الإحساس التدريجي.
      const __liveFinish = (maxMs) => new Promise((res) => {
        __live.done = true;
        __liveTimer();
        if(__live.shown >= __live.target.length && !__live.timer) return res();
        __live.waiters.push(res);
        setTimeout(() => { __live.shown = __live.target.length; }, maxMs);
      });
      const onDelta = (partial) => {
        onDelta._p = partial;
        const stripped = liveStripCode(partial);
        __lastStreamPartial = stripped;
        (function(){ try{ if(window.__chatStatus) window.__chatStatus.release(); }catch(e){ __swallow(e, "misc:app-09-attach#26"); } })();
        // ✂️ liveStripCode قد يُرجِع نصًّا أقصر عند دخول كتلة كود — لا نتجاوزه
        if(stripped.length < __live.target.length) __live.shown = Math.min(__live.shown, Math.max(0, stripped.length - 1));
        __live.target = stripped;
        __liveTimer();
      };
      // المزود المختار من المستخدم يرد بنفسه (Claude هو الافتراضي)؛ الاحتياط صامت عند التعطل فقط
      const isBuildTask = __routeFix && !__gateNoBuild;
      const __selProv = localStorage.getItem('aiapp_provider') || 'claude';
      // v262 — 🎯 التوجيه بالتخصص: في الوضع الافتراضي فقط (المستخدم ما اختار مزودًا بيده)
      // الطلب يروح خلف الكواليس للمزود المتخصص، والواجهة تعرض المزود الافتراضي كما هو.
      // ٦ أغسطس: الاختيار الصريح يُحترم فقط حيث توجد قائمة تُختار منها (الجوال).
      const __respectExplicit = !__provUiHidden() && !!localStorage.getItem('aiapp_provider_explicit');
      const __specProv = (!__routeFix && !__respectExplicit) ? pickSpecialtyProvider(text) : null;
      // 🖼️→🌐 v272: صورة مرفقة + طلب ترجمة/قراءة نص → توجيه خلفي لأقوى مزود رؤية (Claude)
      // حتى لو المستخدم واقف على مزود نظره ضعيف بالصور (Cohere/Groq...). الواجهة ما تتغير.
      const __visionOverride = (imageAttachments.length && text && /(ترجم|ترجمه|ترجمة|ترجملي|translate|translation|اقرأ|اقري|إقرأ|قراءة|شو مكتوب|وش مكتوب|ما المكتوب|what does it say|read the)/i.test(text)) ? 'claude' : null;
      // v382: بوابة البناء دائمًا تروح لـ Claude (الكينج) — أي مزود ثاني ممنوع يوصف البناء
      // v401: البناء وإصلاح الكود يثبتان على Claude — لا كل رسالة قصيرة.
      //
      // v388 استخدم __routeFix، وكان خطأ: تعريفه أوسع بكثير من اسمه. فهو يشمل
      // __editIntent، الذي يتحقّق لأي رسالة ≤ 90 حرفًا فيها فعل من __routeCmdRe
      // — وتلك القائمة تحوي «ممكن» و«أبي» و«أريد» و«عطني». فبمجرد وجود مشروع
      // مفتوح، «ممكن تشرح لي كذا» كانت تُعتبر تعديل كود وتُحوَّل إلى Claude رغم
      // اختيار المستخدم Gemini.
      //
      // الصحيح: بوابة البناء (موافقة صريحة) أو طلب إصلاح صريح («صلّح»، «ما
      // يشتغل»، «error»). أما «ممكن…» فتحترم الزر الذي ضغطه المستخدم.
      // v405: احترام الزر خيارٌ للمستخدم — من يريد مزوده في كل شيء يثبته ويتحمّل نتيجته.
      var __pinProv = false;
      try{ __pinProv = localStorage.getItem('aiapp_pin_provider') === '1'; }catch(e){ __swallow(e, 'ui:pinprov'); }
      const __effProv0 = (!__pinProv && (__gateNoBuild || __routeFix)) ? 'claude' : (__visionOverride || __specProv || __selProv);
      const __effProv = __convLockProvider(cur, __effProv0, !!(__gateNoBuild || __routeFix || __visionOverride), __respectExplicit, isCasualTurn(text));
      // v405: التحويل يُعلَن بدل الصمت — المستخدم يرى مزودًا غير الذي اختاره فيظن الاختيار معطّلًا.
      try{
        var __selLabel = (typeof functionalLabel === 'function') ? functionalLabel(__selProv) : __selProv;
        if(__effProv !== __selProv && window.__chatStatus && !window.__chatStatus.isReleased() && !cur.adMode){
          /* v-prov-status-i18n (شكوى المالك: جملة التحويل عربية وسط واجهة أجنبية):
             قالب مترجم بلغة الواجهة مع خانات {sel}/{why}/{eff}. */
          var __why = (__gateNoBuild || __routeFix) ? t('provWhyBuild')
                    : (__visionOverride ? t('provWhyVision') : t('provWhyGeneral'));
          var __effLabel = (typeof functionalLabel === 'function') ? functionalLabel(__effProv) : __effProv;
          window.__chatStatus.note('↪️', t(__provUiHidden() ? 'provSwitchNoteHidden' : 'provSwitchNote')
            .replace(/\{sel\}/g, __selLabel).replace('{why}', __why).replace('{eff}', __effLabel));
        }
      }catch(e){ __swallow(e, 'ui:switchnote'); }
      const __teamOrder = [__effProv, ...(__routeFix ? ['claude', 'openai', 'gemini'] : ['claude', 'openai', 'gemini']).filter(p => p !== __effProv)];
      window.__claudeModelOverride = null;
      window.__claudeThinking = !__routeFix && __selProv === 'claude' && !cur.adMode; // 🧠 تفكير داخلي — مُعطَّل في وضع الإعلان
      // 🛠️ v468: البوّابة تعلو على اليد — في دور الاستئذان لا تُمرَّر الأدوات
      // إطلاقًا، وإلّا غلبت تعليمة «ابنِ ولا تستأذن» داخل chat.js. بعد الموافقة
      // يسقط __gateNoBuild فتعمل اليد كاملة (صور + كود + تجربة).
      // v-chat-vision: الصور مع كلود تمر بمسار الأدوات المباشر القوي نفسه —
      // كانت تُقصى منه كلها فتسقط لمسار قديم أضعف (سبب تحليل الصور السطحي).
      // بقية المزوّدات تبقى مُقصاة: كتل الرؤية بصيغة Anthropic لا تناسبها.
      const __toolsWillRun = (window.__chatToolsOn !== false && !__routeFix && (!__gateNoBuild || !!__gateApprovedText)
        && (!imageAttachments.length || __effProv === 'claude')
        && TOOL_PROVIDERS.indexOf(__effProv) !== -1
        && typeof window.callChatWithTools === 'function');
      if(__gateApprovedText && __toolsWillRun){
        // ✅ وافق المستخدم → يبني الآن كاملًا باليد الكاملة (صور مرسومة + كود + تجربة).
        apiMessages.push({ role: 'system', content: 'وافق المستخدم على البناء. ابنِه الآن كاملًا في هذا الردّ داخل كتلة ```html واحدة، مستندًا كاملًا. استدعِ generate_image لكل صورة تحتاجها (حتّى أربع) وضع الرمز العائد حرفيًّا في src — ممنوع picsum أو placeholder أو أي رابط صورة خارجي. ممنوع أن تسأل مرّة أخرى.' });
      } else if(__gateNoBuild){
        // 🔒 دور البوابة: صف الفكرة واسأل الإذن — ممنوع البناء الآن.
        apiMessages.push({ role: 'system', content: 'المستخدم طلب بناء شيء. ممنوع أن تبنيه الآن. ردّ بنصّ محادثة فقط بلا أيّ كتلة كود: اذكر في سطرين إلى ثلاثة ماذا ستبني بالضبط (الأقسام الرئيسية + أنّك سترسم الصور بنفسك)، ثمّ اختم بسؤال واحد فقط: «تبيني أبدأ البناء الحين؟». لا تبدأ البناء حتّى يوافق المستخدم في رسالته التالية.' });
      }
      // v469: Q&A system prompt مدمج في __sys — لا حاجة لـ unshift إضافي.
      let reply, providerKey, switched, requestedKey;
      let __ctUsed = false;
      let __ctSources = null; /* v-one-brain: مصادر بحث النموذج — نطاق يبلغ موضع اللصق */
      // 💬 عقل واحد: Claude وحده يرد في النقاش العادي — الاحتياط (GPT ثم Gemini)
      // صامت ويشتغل فقط إذا Claude تعطل أو خلص حده.
      // 🛠️ ومعه يداه: النقاش العادي على Claude يمرّ بحلقة الأدوات (بحث · قراءة
      // صفحة · تشغيل كود)، فيقرّر النموذج بنفسه متى يحتاج أداة بدل أن تقرّر
      // عنه أنماط نصّيّة في المتصفّح. أيّ عثرة تهبط صامتة إلى المسار القديم.
      try{
        let __ct = null;
        if(__toolsWillRun){
          try{ __ct = await window.callChatWithTools(apiMessages.filter(m => !m.__static), onDelta, __effProv); }
          catch(e){ if(e && e.name === 'AbortError') throw e; __ct = null; __swallow(e, 'chat:tools'); }
          /* v-tools-team (شكوى المالك «خربت الدنيا بخصوص الأخبار»): فشل مزود
             الأدوات الأول (مثال: رصيد كلود نفد) كان يهبط فورًا للمسار القديم
             بلا بحث حي، فيؤلف البديل أخبارًا من خياله (فهم «العالمي» نادي
             النصر واخترع نتائج). الآن الاحتياط يبقى داخل مسار الأدوات نفسه —
             نفس البحث الحي الحقيقي — قبل أي هبوط للمسار القديم. */
          if(!__ct && !(imageAttachments.length && __effProv === 'claude')){
            const __toolsTeam = ['openai', 'deepseek', 'gemini'].filter(p => p !== __effProv && TOOL_PROVIDERS.indexOf(p) !== -1).slice(0, 2);
            for(const __tp of __toolsTeam){
              try{
                try{
                  if(window.__chatStatus && !window.__chatStatus.isReleased()){
                    window.__chatStatus.phase('💭', functionalLabel(__tp) + ' ' + t('provTypingSuffix'));
                  }
                }catch(e){ __swallow(e, 'ui:toolsteam'); }
                __ct = await window.callChatWithTools(apiMessages.filter(m => !m.__static), onDelta, __tp);
                if(__ct) break;
              }catch(e){ if(e && e.name === 'AbortError') throw e; __ct = null; __swallow(e, 'chat:tools-team'); }
            }
          }
        }
        if(__ct){ __ctUsed = true; ({ reply, providerKey, switched, requestedKey } = __ct); if(__ct.sources) __ctSources = __ct.sources; }
        else ({ reply, providerKey, switched, requestedKey } = await callAIWithFallback(apiMessages, onDelta, __teamOrder));
      }finally{
        window.__claudeModelOverride = null;
        window.__claudeThinking = false;
      }
      let { code, explanation, codeType } = extractReply(reply);
      // v-reveal-live: رد نصّي بلا كود → ننتظر حركة الكتابة تلحق آخر حرف
      // قبل الرسم النهائي. مع الكود لا ننتظر إطلاقًا حتى لا تتأخر المعاينة.
      if(code){
        __live.done = true;
        __live.shown = __live.target.length;
        if(__live.timer){ clearInterval(__live.timer); __live.timer = null; }
      } else {
        // v-reveal-quick: سقف الأمان هبط ١٥→٦ ثوانٍ — اللحاق المتسارع يكفي.
        try{ await __liveFinish(6000); }catch(e){ __swallow(e, 'ui:reveal-live'); }
      }
      const __builtByTools = !!(code && __ctUsed && !isBuildTask);
      // v491: أيّ كود مُستخرَج يصل المعاينة دائمًا — حتّى لو لم يعرف كاشف
      // النيّة الطلب (مثال: ردّ المستخدم «أبدأ» على سؤال البوّابة).
      void __builtByTools;
      if(code){
        // 🔁 التصحيح الذاتي: فحص الكود وإصلاح أخطائه قبل العرض
        try{
          const healed = await selfHealCode(code, codeType, () => {
            chatPhase('🩹', t('selfHealing'), thinkingDiv);
            smartScrollBottom();
          });
          if(healed) code = healed;
        }catch(healErr){ console.warn('[selfHeal] skipped:', healErr); }
        cur.code = code;
      }
      // v359 — الشفافية الكاملة (قرار المستخدم): الفقاعة تعرض الاسم الحقيقي الشهير
      // للمزود الذي ردّ فعلًا (Claude/Gemini/GPT أو الاحتياط الحقيقي مثل DeepSeek).
      void __specProv; void __selProv; void switched;
      let providerLabel = functionalLabel(providerKey);
      void switched; void requestedKey;
      // v463: askAllReply=false — الردود العادية ما تدخل compare-row
      // v559: لا بطاقات مصادر تحت سؤال توضيحي قصير بلا نتائج.
      const __ansTxt = String((code ? stripCodeFromChat(explanation) : explanation) || '').trim();
      const __clarifyQ = __ansTxt.length < 140 && /[?？؟]\s*$/.test(__ansTxt);
      /* v-chat-video-attach (لقطة المالك: «تم! هذا فيديو ترويجي…» بلا أي فيديو):
         أداة generate_video تنجح وتحفظ الرابط في __chatVideoResult، لكن هذا
         المسار (المزود الواحد + الأدوات) لم يكن يقرأه — كان يُقرأ في مسار
         «اسأل الكل» فقط — فيضيع الفيديو وتبدو الرسالة إنجازًا وهميًّا. */
      let __chatVidAtt;
      try{
        const __cv = window.__chatVideoResult;
        if(__cv && __cv.url){ __chatVidAtt = [{ isVideo: true, url: __cv.url, name: __cv.name || 'chat-video.mp4', mime: 'video/mp4' }]; window.__chatVideoResult = null; }
      }catch(e){ __swallow(e, 'ui:chat-video-attach'); }
      cur.messages.push({role: 'assistant', content: (code ? stripCodeFromChat(explanation) : explanation) || (code ? t('buildSuccess') : ''), code: code || null, providerLabel, providerKey, askAllReply: false, attachments: __chatVidAtt,
        // v-one-brain: بطاقات المصادر من بحث النموذج نفسه (حدث sources في البث).
        sources: (!__clarifyQ && (__ctSources || (__searchData && __searchData.sources))) || undefined,
        searchImages: (__searchData && __searchData.images) || undefined});
      // 👑 الرد الاحترافي اكتمل: حدّث رصيد النقاط وأظهر خصمًا متحركًا صغيرًا.
      try{
        if(window.__premiumOn === true && typeof isPremiumProvider === 'function' && isPremiumProvider()){
          if(typeof showPremiumDeduction === 'function') showPremiumDeduction();
          if(typeof refreshPremiumPoints === 'function') refreshPremiumPoints();
        }
      }catch(_){ __swallow(_, "points:app-09-attach#27"); }
    }
  }catch(err){
    if(err && err.name === 'AbortError'){
      // الإيقاف لا يمحو سؤال المستخدم ولا يعيده إلى الصندوق. نثبّت آخر نص
      // وصل من البث كإجابة متوقفة، فيستطيع المستخدم قراءته أو إعادة توليده.
      try{ thinkingDiv.remove(); }catch(e){ __swallow(e, 'ui:chat-stop-remove'); }
      const lastMsg = cur.messages[cur.messages.length - 1];
      if(lastMsg && lastMsg.role === 'user'){
        const partial = String(__lastStreamPartial || '').trim();
        cur.messages.push({
          role: 'assistant',
          content: partial || (window.__omranTimedOut ? (lang === 'ar' ? '⚠️ انقطع الاتصال قبل وصول النتيجة — أعد المحاولة.' : '⚠️ The connection dropped before the result arrived — please try again.') : (lang === 'ar' ? 'تم إيقاف الرد قبل اكتماله.' : 'The response was stopped before it completed.')),
          _stopped: true,
          askAllReply: false
        });
      }
      promptEl.value = '';
      window.__chatEditRequest = null;
      setChatEditNotice(false);
    } else if(err && err.premiumNoPoints){
      // 👑 نفاد النقاط أثناء الرد الاحترافي: رسالة ودّية + طريقة لشراء نقاط،
      // وإطفاء الوضع الاحترافي حتى تكون الرسالة التالية مجانية.
      window.__premiumOn = false;
      try{ if(typeof updatePremiumToggleVisibility === 'function') updatePremiumToggleVisibility(); }catch(_){ __swallow(_, "points:app-09-attach#28"); }
      try{ settingsToast(t('premiumNoPoints')); }catch(_){ __swallow(_, "points:app-09-attach#29"); }
      try{ if(typeof openPremiumBuyPoints === 'function') openPremiumBuyPoints(); }catch(_){ __swallow(_, "points:app-09-attach#30"); }
    } else {
      cur.messages.push({role: 'assistant', content: '⚠️ ' + __friendlyErr(err)});
    }
  }finally{
    __omranDisarmWatchdog();  // v586
    const __keepReaderPosition = !document.documentElement.classList.contains('mobile-ui') && typeof chatIsNearBottom === 'function' ? !chatIsNearBottom() : false;
    genAbortController = null;
    btnStop.classList.remove('live');
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' /* v-send-plane: سهم الإرسال طائرة ورقية كما في صورة المالك */;
    saveState();
    renderAll(__keepReaderPosition);
    // 🧠 تحديث ذاكرة المستخدم بعد اكتمال الرد (بدون انتظار)
    try{
      const __lastA = cur.messages.filter(m => m.role === 'assistant').slice(-1)[0];
      if(__lastA && __lastA.content && !String(__lastA.content).startsWith('⚠️') && !(isPureGreeting(text) || isCasualCheckIn(text))){
        memoryUpdate(text, String(__lastA.content));
        // 🗂️ v326: تحديث ملخص موضوع هذه المحادثة في الذاكرة السحابية
        try{ window.memoryTopicUpdate && window.memoryTopicUpdate(cur, text, String(__lastA.content)); }catch(e){ __swallow(e, "misc:app-09-attach#31"); }
      }
    }catch(e){ __swallow(e, "misc:app-09-attach#32"); }
    if($('#btnVoiceChat').classList.contains('active')){
      const lastMsg = cur.messages[cur.messages.length - 1];
      if(lastMsg && lastMsg.role === 'assistant' && lastMsg.content){
        const assistantDivs = messagesEl.querySelectorAll('.msg.assistant');
        const lastDiv = assistantDivs[assistantDivs.length - 1];
        const wordEls = lastDiv ? Array.from(lastDiv.querySelectorAll('.tts-word')) : null;
        speakSmart(lastMsg.content, null, null, false, wordEls);
      }
    }
    // Preview no longer auto-opens on mobile after generation; the user
    // must tap "استخدم هذا الإصدار" to view the result, matching Ask-All mode.
    refreshProviderQuickBar();
  }
}

localStorage.removeItem('autoSpeakReplies');
applyLanguage();
renderAll();
try{ refreshProviderQuickBar(); }catch(e){ console.error('quickbar init', e); }
// 💾 تحميل/ترحيل المشاريع من IndexedDB (سعة كبيرة، تحل مشكلة "مساحة التخزين ممتلئة").
(async () => {
  // v378: شبكة أمان — لو علّق التحميل المحلي لأي سبب، نفتح المزامنة بعد 10 ثواني.
  setTimeout(() => { window.__localChatsLoaded = true; }, 10000);
  if(!window.indexedDB){ window.__localChatsLoaded = true; return; }
  // v-idb-timeout: على iOS PWA قد يتجمد idbGet للأبد عند الإقلاع البارد —
  // مهلة ٣ ثوانٍ ثم محاولة إنعاش واحدة (٥ ثوانٍ)؛ الفشل النهائي يُبلَّغ
  // ويُترك للمرآة (v-idb-mirror) التي رسمت المحادثات أصلًا من أول لحظة.
  const idbGetGuarded = async (key) => {
    const withTimeout = (ms) => Promise.race([
      idbGet(key),
      new Promise((_, rej) => setTimeout(() => rej(new Error('idb-timeout')), ms)),
    ]);
    try{ return await withTimeout(3000); }
    catch(e1){
      try{ return await withTimeout(5000); }
      catch(e2){
        try{
          fetch('/api/system?action=client-errors', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ message: 'v-idb-hang: تجمّد تحميل المحادثات من IndexedDB — المرآة هي المعروضة', source: 'app-09', line: 0, col: 0, stack: '', url: location.pathname, ua: navigator.userAgent }) }).catch(function(){ /* guard-ok */ });
        }catch(e3){ /* guard-ok: الإبلاغ ترف */ }
        throw e2;
      }
    }
  };
  try{
    const migrated = localStorage.getItem('aiapp_idb_on') === '1';
    if(!migrated){
      // أول تشغيل: بيانات localStorage هي المصدر → ننسخها إلى IndexedDB ثم نحرر المساحة.
      const idbOld = await idbGetGuarded('aiapp_projects');
      const merged = Array.isArray(idbOld) && idbOld.length
        ? idbOld.filter(p => !state.projects.some(q => q.id === p.id)).concat(state.projects)
        : state.projects;
      state.projects = merged;
      await idbSet('aiapp_projects', JSON.parse(JSON.stringify(merged)));
      localStorage.setItem('aiapp_idb_on', '1');
      try{ localStorage.removeItem('aiapp_projects'); }catch(e){ __swallow(e, "save:app-09-attach#33"); }
      renderAll();
    } else {
      const idbProjects = await idbGetGuarded('aiapp_projects');
      if(Array.isArray(idbProjects) && idbProjects.length){
        // دمج أي مشاريع أنشئت قبل اكتمال التحميل (نادر) بدون فقدان — وإن كان
        // المعروض مرآةً وكتب المستخدم فيها رسالة قبل وصول الكاملة، تُحفظ نسخته
        // الأغنى بدل سحقها (v-idb-mirror).
        const extra = state.projects.filter(p => !idbProjects.some(q => q.id === p.id));
        state.projects = idbProjects.map(ip => {
          const sp = state.projects.find(q => q.id === ip.id);
          return (sp && (sp.messages || []).length > (ip.messages || []).length) ? sp : ip;
        }).concat(extra);
        window.__usingSlimProjects = false;
        renderAll();
      }
      try{ if(window.__writeChatsMirror) window.__writeChatsMirror(); }catch(e){ __swallow(e, 'mirror:app-09#fresh'); }
    }
    // 🧹 v308: تنظيف لمرة واحدة — لقطات آلة الزمن القديمة المنتفخة بوسائط base64
    // (كانت تنسخ الصور المضمنة 12 مرة وتفجّر تخزين iOS فتختفي المحادثات).
    try{
      let cleaned = false;
      (state.projects || []).forEach(p => {
        (p.codeHistory || []).forEach((s, si) => {
          if(s && typeof s.code === 'string' && s.code.length > 500000){
            let c = s.code.replace(/data:(image|audio|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]{200,}/g, 'data:image/png;base64,SNAPSHOT_MEDIA_OMITTED');
            if(c.length > 500000) c = c.slice(0, 500000);
            s.code = c; cleaned = true;
          }
        });
      });
      if(cleaned) saveState();
    }catch(e){ __swallow(e, "save:app-09-attach#34"); }
    // 🧹 v310: تنظيف بقايا الجلسات المقطوعة — معرفات _uid القديمة (تسبب تصادم
    // البث مع فقاعات قديمة) + فقاعات "⏳/يجهز" عالقة انحفظت قبل اكتمال الرد.
    try{
      let fixed = false;
      (state.projects || []).forEach(p => {
        if(!Array.isArray(p.messages)) return;
        const before = p.messages.length;
        p.messages = p.messages.filter(m => !(m && (m.isAskAllPrep || (m._loading && !m.content))));
        if(p.messages.length !== before) fixed = true;
        p.messages.forEach(m => {
          if(!m) return;
          if(m._uid !== undefined){ delete m._uid; fixed = true; }
          if(m._loading){ m._loading = false; fixed = true; }
        });
      });
      if(fixed) saveState();
    }catch(e){ __swallow(e, "save:app-09-attach#35"); }
    // 🔁 فتح آخر مشروع تلقائيًا حتى يشوف المستخدم آخر محادثته فورًا.
    if(!state.currentId && state.projects.length){
      const savedId = localStorage.getItem('aiapp_current_id');
      const p = state.projects.find(q => q.id === savedId) || state.projects[state.projects.length - 1];
      if(p){
        state.currentId = p.id;
        renderAll();
        try{ messagesEl.scrollTop = messagesEl.scrollHeight; }catch(e){ __swallow(e, "misc:app-09-attach#36"); }
      }
    }
    // 🕯️ الدوام٢: المشاريع صارت في اليد → اسأل الدفتر إن كان تشغيل قد نجا.
    // بلا await: الاستئناف قد ينتظر دقائق، ولا يجوز أن يحبس بقيّة التحميل.
    __agentResumeOnLoad().catch(e => console.warn('[agent] resume on load failed', e));
  }catch(e){
    console.error('IDB init/migration failed → staying on localStorage', e);
    __idbBroken = true;
  }
  // v378: اكتمل تحميل المحادثات المحلية → المزامنة مع السيرفر مسموحة الآن.
  window.__localChatsLoaded = true;
})();
if('speechSynthesis' in window){
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
}

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
