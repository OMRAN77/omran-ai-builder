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
    // الجوال خارج نطاق هذه المرحلة: نحافظ على عرضه السابق حرفيًا.
    if(document.documentElement.classList.contains('mobile-ui')){
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.7;opacity:.9;';
      steps.forEach(function(s, i){
        const row = document.createElement('div');
        const isLast = (i === steps.length - 1);
        row.style.cssText = 'display:flex;align-items:flex-start;gap:7px;' + (s.state === 'fail' ? 'opacity:.75;' : '');
        const icon = document.createElement('span');
        icon.textContent = s.state === 'fail' ? '✗' : (s.state === 'done' ? '✓' : s.icon || '•');
        icon.style.cssText = 'flex:0 0 auto;' + (s.state === 'done' ? 'color:#2e9e6b;' : (s.state === 'fail' ? 'color:#c0453f;' : ''));
        const txt = document.createElement('span');
        txt.textContent = s.text;
        if(isLast && s.state === 'run') txt.style.cssText = 'animation:omranPulse 1.4s ease-in-out infinite;';
        row.appendChild(icon); row.appendChild(txt); wrap.appendChild(row);
      });
      el.appendChild(wrap);
      return;
    }
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
    currentIcon.textContent = current.state === 'fail' ? '✗' : (current.state === 'done' ? '✓' : current.icon || '•');
    const currentText = document.createElement('span');
    currentText.textContent = current.text;
    if(current.state === 'run') currentText.className = 'chat-status-running';
    summary.appendChild(currentIcon); summary.appendChild(currentText);
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

function renderAttachStrip(){
  const strip = $('#attachStrip');
  strip.innerHTML = '';
  try{ window.__updateSendReady && window.__updateSendReady(); }catch(e){ __swallow(e, "upload:app-09-attach#1"); }
  pendingAttachments.forEach((a, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attach-chip';
    if(a.isImage){
      const img = document.createElement('img');
      img.src = a.dataUrl;
      chip.appendChild(img);
    }
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = a.name + (a.pending ? ' ⏳' : (a.error ? ' ⚠️' : ''));
    chip.appendChild(name);
    const rm = document.createElement('span');
    rm.className = 'rm';
    rm.textContent = '✕';
    rm.onclick = () => { pendingAttachments.splice(idx, 1); renderAttachStrip(); };
    chip.appendChild(rm);
    strip.appendChild(chip);
  });
}

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
const IMAGE_MAX_DIMENSION = 2048;
const IMAGE_JPEG_QUALITY = 0.95;
const IMAGE_PASSTHROUGH_BYTES = 3.5 * 1024 * 1024; // send as-is, zero re-encode
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
      fr.onload = () => resolve({ dataUrl: fr.result, mime: file.type });
      fr.onerror = reject;
      fr.readAsDataURL(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try{
        let { width, height } = img;
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
        resolve({ dataUrl, mime });
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
  const start = promptEl.selectionStart ?? promptEl.value.length;
  const end = promptEl.selectionEnd ?? promptEl.value.length;
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

$('#attachInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for(const file of files){
    try{
      if(file.size > MAX_ATTACH_FILE_BYTES){
        console.error('attach file too large', file.name, file.size);
        pendingAttachments.push({ name: file.name, isImage: false, error: true, text: '⚠️ ' + file.name + ': ' + t('attachTruncated') });
        continue;
      }
      if(IMAGE_TYPES.test(file.type)){
        let dataUrl, mime;
        try{
          const resized = await resizeImageFile(file);
          dataUrl = resized.dataUrl;
          mime = resized.mime;
        }catch(resizeErr){
          // Fall back to the original file if resizing fails for any reason
          // (e.g. unsupported image type in <canvas>), but warn if it's huge.
          console.error('image resize failed, using original', resizeErr);
          dataUrl = await readFileAsDataUrl(file);
          mime = file.type;
        }
        // v381: نسخة مضغوطة للمزامنة
        var serverThumb = '';
        try{ serverThumb = await makeServerThumb(dataUrl); }catch(e){ __swallow(e, "misc:app-09-attach#2"); }
        pendingAttachments.push({ name: file.name, isImage: true, mime, dataUrl, serverThumb });
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
  e.target.value = '';
});

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
function extractOverlayText(t){
  let m = t.match(/["'«»“”](.+?)["'«»“”]/); if(m && m[1].trim()) return m[1].trim();
  const clean = (x)=>{ x = (x||'').trim().replace(/[.!؟?]+$/,'').trim(); if(!x || /^(?:على|فوق|في)?\s*الصور/.test(x) || /^(?:on|in)?\s*(?:the\s+)?(?:image|photo|picture)/i.test(x)) return null; return x; };
  m = t.match(/(?:اكتب|أكتب)\s+(?:لي\s+)?(?:كلمة\s+|نص\s+|اسم\s+)?(.+?)(?:\s+(?:على|فوق|في)\s+الصور[ةه].*)?$/); if(m){ const r=clean(m[1]); if(r) return r; }
  m = t.match(/(?:حط|ضيف|أضف|اضف)\s+(?:لي\s+)?(?:اسمي|اسم|كلمة|نص)\s+(.+?)(?:\s+(?:على|فوق|في)\s+الصور[ةه].*)?$/); if(m){ const r=clean(m[1]); if(r) return r; }
  m = t.match(/(?:write|put|add)\s+(?:the\s+)?(?:text\s+|name\s+|word\s+)?(.+?)(?:\s+(?:on|to|in)\s+(?:the\s+)?(?:image|photo|picture).*)?$/i); if(m){ const r=clean(m[1]); if(r) return r; }
  return null;
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
  othmani: { css: 'Amiri', gf: 'Amiri:wght@700' },
  naskh:   { css: 'Amiri', gf: 'Amiri:wght@700' },
  ruqaa:   { css: 'Aref Ruqaa', gf: 'Aref+Ruqaa:wght@700' },
  kufi:    { css: 'Reem Kufi', gf: 'Reem+Kufi:wght@700' },
  diwani:  { css: 'Lateef', gf: 'Lateef:wght@700' },
  modern:  { css: 'Cairo', gf: 'Cairo:wght@700' },
};
async function mahaLoadFont(key){
  const f = MAHA_FONTS[key] || MAHA_FONTS.modern;
  if(!document.getElementById('gf-' + f.css)){
    const l = document.createElement('link');
    l.id = 'gf-' + f.css; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f.gf + '&display=swap';
    document.head.appendChild(l);
  }
  try{ await document.fonts.load('bold 40px "' + f.css + '"', 'عيدكم مبارك'); }catch(_){ __swallow(_, "misc:app-09-attach#3"); }
  return f.css;
}
async function overlayTextOnImage(b64, mime, txt, fontKey, colorStr){
  const fontCss = await mahaLoadFont(fontKey || 'modern');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try{
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        let fs = Math.floor(c.width / 9);
        const setF = () => { ctx.font = 'bold ' + fs + 'px "' + fontCss + '", "Segoe UI", Tahoma, Arial, sans-serif'; };
        setF();
        while(ctx.measureText(txt).width > c.width * 0.9 && fs > 14){ fs -= 2; setF(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const x = c.width / 2, y = c.height - Math.max(20, Math.floor(c.height * 0.05));
        ctx.lineWidth = Math.max(3, Math.floor(fs / 7));
        const fill = (colorStr || '#ffffff');
        // حدود داكنة للألوان الفاتحة وفاتحة للألوان الداكنة عشان يظل النص واضح
        let dark = false;
        if(/^#[0-9a-f]{6}$/i.test(fill)){
          const lum = parseInt(fill.slice(1,3),16)*0.299 + parseInt(fill.slice(3,5),16)*0.587 + parseInt(fill.slice(5,7),16)*0.114;
          dark = lum < 128;
        }
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
        ctx.strokeText(txt, x, y);
        ctx.fillStyle = fill; ctx.fillText(txt, x, y);
        resolve((c.toDataURL('image/png')).split(',')[1]);
      }catch(e){ reject(e); }
    };
    img.onerror = reject;
    img.src = 'data:' + mime + ';base64,' + b64;
  });
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
        __agentStep = agentStatus.step('•', String(ev.status).replace(/^[^\p{L}\p{N}]+/u, '').trim() || ev.status);
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

async function omModeGenerateImage(cur, promptText, thinkingDiv){
  const __m = { role: 'assistant', content: lang === 'ar' ? '🎨 أرسم لك الصورة…' : '🎨 Generating your image…', _loading: true };
  cur.messages.push(__m); renderAll();
  try{
    const __r = await fetch('/api/maha-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() })
    });
    const __d = await __r.json().catch(() => ({}));
    __m._loading = false;
    if(__r.ok && __d && __d.imageBase64){
      const __mime = __d.mimeType || 'image/png';
      __m.content = lang === 'ar' ? 'تفضّل 👇' : 'Here you go 👇';
      __m.attachments = [{ isImage: true, dataUrl: 'data:' + __mime + ';base64,' + __d.imageBase64, name: 'image.png' }];
      try{ cur.lastEditedImage = { b64: __d.imageBase64, mime: __mime }; }catch(e){}
    } else {
      __m.content = lang === 'ar' ? ('تعذّر توليد الصورة الآن — ' + ((__d && __d.error) || ('HTTP ' + __r.status))) : ('Image generation failed — ' + ((__d && __d.error) || ('HTTP ' + __r.status)));
    }
  }catch(e){
    __m._loading = false;
    __m.content = lang === 'ar' ? 'تعذّر توليد الصورة الآن — جرّب مرّة ثانية.' : 'Image generation failed — please try again.';
  }
  renderAll(); saveState();
  try{ thinkingDiv && thinkingDiv.remove(); }catch(e){}
}
async function sendPrompt(){
  // ✅ v301: قفل الإرسال أثناء التوليد — Enter أو أي ضغطة إضافية لا ترسل
  // الطلب مرة ثانية (كان زر الإرسال ينقفل لكن Enter يظل شغالًا فيتكرر الطلب).
  try{ const __sb = $('#btnSend'); if(__sb && __sb.disabled) return; }catch(e){ __swallow(e, "misc:app-09-attach#6"); }
  const promptEl = $('#prompt');
  let text = promptEl.value.trim();
  if(!text && pendingAttachments.length === 0) return;
  if(pendingAttachments.some(a => a.pending)){
    alert(lang === 'ar' ? 'الرجاء الانتظار حتى ينتهي تحليل الأرشيف' : 'Please wait until archive analysis finishes');
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
  const __IMG_FOLLOW = (function(){
    try{
      const c = getCurrent();
      if(!c || !c.lastMsgWasImageEdit || !c.lastEditedImage || !c.lastEditedImage.b64) return false;
      if(pendingAttachments.some(a => a.isImage)) return false;
      if(!text || text.length > 220) return false;
      if(/بوت|تطبيق|برنامج|موقع|صفحة|لعبة|لعبه|سكربت|\bapp\b|\bwebsite\b|\bpage\b|\bbot\b|\bgame\b|\bscript\b|\bcode\b|كود/i.test(text)) return false;
      return /(ضيف|أضف|اضف|حط|عدل|عدّل|غير|غيّر|بدل|بدّل|امسح|احذف|ازل|أزل|شل|شيل|كبر|كبّر|صغر|صغّر|لون|لوّن|اكتب|أكتب|زخرف|خل|اجعل|حسن|حسّن|رتب|رتّب|نفس الصور|نفس الشعار|هالصور|هالشعار|عليها|فيها|منها|\badd\b|\bput\b|\bchange\b|\bremove\b|\berase\b|\bwrite\b|\brecolor\b|same image|same logo|on it)/i.test(text);
    }catch(e){ return false; }
  })();
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
    } else if(text && !__IMG_FOLLOW && !__looksPasted && ((GATE_BUILD_RE.test(text) && GATE_CMD_RE.test(text)) || __strongBuildRe.test(text)) && !GATE_FIX_RE.test(text)){
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
    cur = {id, title: (text || pendingAttachments[0]?.name || 'مشروع').slice(0, 30), messages: [], code: '', codeType: 'html'};
    state.projects.push(cur);
    state.currentId = id;
  }
  if(cur.messages.length === 0){
    cur.title = (text || pendingAttachments[0]?.name || 'مشروع').slice(0, 30);
  }

  const attachmentsForMsg = pendingAttachments.slice();
  const imageAttachments = attachmentsForMsg.filter(a => a.isImage);
  const textAttachments = attachmentsForMsg.filter(a => !a.isImage);

  // Build the text sent to the AI: original text + any text-file contents appended as code blocks
  let apiText = text;
  try{ if(window.__omMode==='think') apiText = (lang==='ar'?'فكّر بعمق خطوة بخطوة، وحلّل الاحتمالات قبل أن تجيب.\n\n':'Think deeply, step by step, before answering.\n\n') + apiText; else if(window.__omMode==='learn') apiText = (lang==='ar'?'اشرح لي كمعلّم صبور: خطوات مرقّمة، أمثلة بسيطة، ثمّ سؤال يختبر فهمي.\n\n':'Teach me patiently: numbered steps, simple examples, then one question.\n\n') + apiText; }catch(e){}
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
  }catch(e){ __swallow(e, "upload:app-09-attach#12"); }
  cur.messages.push({role: 'user', content: (__gateApprovedText || text) || (t('imagesAttachedNote')), attachments: attachmentsForMsg.length ? attachmentsForMsg : undefined, apiText, apiImages: imageAttachments.length ? imageAttachments : undefined});
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
  const __editIntent = !!cur.code && __editVerbRe.test(text) && (__editObjRe.test(text) || (!__questionStartRe.test(text.trim()) && text.trim().length <= 90));
  const __routeFix = (__routeFixRe.test(text) || __editIntent) && !!cur.code;
  // البناء لا يبدأ إلا بفعل أمر صريح (ابني/بناء/سوي/اعمل...) + كلمة تطبيق/موقع/بوت.
  const __routeCmdRe = /(ابني|ابن\s|بناء|نبني|اعمل|أعمل|سوي|سوّي|صمم|صمّم|انشئ|أنشئ|انشاء|إنشاء|اصنع|اضف|أضف|عدل|عدّل|طور|طوّر|حدث|حدّث|كمل|أكمل|اكمل|ممكن|ابغي|أبغي|ابغى|أبغى|ابي|أبي|بغيت|اريد|أريد|عطني|أعطني|اعطني|هات|سولي|سوّلي|(?:^|\s)سو\s|build|create|make|design|develop|add|update|improve|\bwant\b|\bgive\b|\bcan you\b)/i;
  // 🚫 قرار نهائي (26/7): "اسأل الكل" ملغي بالكامل — لا زر ولا كتابة.
  // كلود يبني ويرد بروحه دائمًا (وGPT احتياط صامت إذا فشل).
  const __askAllExplicit = false;
  customProviders = null;
  const askAll = !!customProviders || __askAllExplicit || (!__gateNoBuild && !__gateApprovedText && ((__routeBuildRe.test(text) && __routeCmdRe.test(text)) || __strongBuildRe.test(text)) && !__routeFix);

  try{
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
    const __isPhotoFetch = !__isLogoFetch && __photoFetchRe.test(text) && !__genDrawRe.test(text) && !cur.adMode && !cur.awaitingAdMode;
    if(!imageAttachments.length && !__editIntent && (__isLogoFetch || __isPhotoFetch)){
      const __logoMsg = { role: 'assistant', content: lang === 'ar' ? (__isLogoFetch ? '🔍 أجيب لك الشعار الأصلي من البحث…' : '🔍 أجيب لك صور حقيقية من البحث…') : '🔍 Fetching real images from live search…', _loading: true };
      cur.messages.push(__logoMsg);
      renderMessages(true);
      try{
        const __lr = await fetch('/api/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text.replace(/عطني|أعطني|اعطني|هات|جيب|ابغي|أبي|اريد|أريد|وريني|أرني|ارني|اعرض/g, '').trim() + (__isLogoFetch ? ' logo png' : ''), images: true, lang, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() })
        });
        const __ld = await __lr.json();
        const __imgs = (Array.isArray(__ld.images) ? __ld.images : []).slice(0, 4);
        if(__imgs.length){
          __logoMsg._loading = false;
          __logoMsg.content = lang === 'ar' ? (__isLogoFetch ? 'هذا الشعار الأصلي من البحث المباشر 👇 اضغط على الصورة لعرضها كبيرة، أو حمّلها مباشرة.' : 'هذي صور حقيقية من البحث المباشر 👇 اضغط على أي صورة لعرضها كبيرة، أو حمّلها مباشرة.') : 'Here are real images from live search 👇';
          __logoMsg.attachments = __imgs.map((u, i) => ({ isImage: true, dataUrl: (typeof u === 'string' ? u : (u && u.url) || ''), name: (__isLogoFetch ? 'logo-' : 'photo-') + (i + 1) + '.png' })).filter(a => a.dataUrl);
        } else {
          __logoMsg._loading = false;
          __logoMsg.content = lang === 'ar' ? (__isLogoFetch ? 'ما حصلت الشعار في البحث المباشر 😕 جرب تكتب اسم الجهة بشكل أوضح (مثال: "شعار شرطة دبي").' : 'ما حصلت صور في البحث المباشر 😕 جرب توضح طلبك أكثر.') : 'Could not find images via live search. Try a clearer request.';
        }
      }catch(e){
        __logoMsg._loading = false;
        __logoMsg.content = lang === 'ar' ? 'تعذر جلب الشعار الآن — جرب مرة ثانية.' : 'Could not fetch the logo right now — try again.';
      }
      renderAll(); saveState();
      thinkingDiv && thinkingDiv.remove();
      return;
    }
    // 🖼️ تعديل الصور بالأوامر النصية: صورة مرفقة + طلب تعديل → Gemini يرجع الصورة معدّلة
    // Follow-up edits on the same image work too ("زين، الحين كبّر الخط").
    const __imgEditRe = /(عدل|عدّل|غير|غيّر|ضيف|أضف|اضف|حط|امسح|احذف|ازل|أزل|اجعل|خل|لون|لوّن|كبر|كبّر|صغر|صغّر|زخرف|اكتب|ارسم|حسن|حسّن|حول|حوّل|صمم|صمّم|نسق|نسّق|رتب|رتّب|ديكور|سوي|سوّي|سولي|سو لي|ادمج|أدمج|دمج|edit|change|add|put|remove|erase|make|recolor|write|draw|enhance|convert|transform|redesign|restyle|decor|merge|combine)/i;
    const __codeWordRe = /(كود|تطبيق|موقع|صفحة|زر\s|لعبة|سكربت|code|app|website|page|button|game|script)/i;
    const __srcImg = imageAttachments.length ? imageAttachments[imageAttachments.length - 1] : null;
    // 🧠 v293: أي صورة مرفقة جديدة تنحفظ كآخر صورة في المحادثة
    if(__srcImg && !__srcImg._fromMemory){
      cur.lastEditedImage = { b64: (__srcImg.dataUrl || '').split(',')[1] || '', mime: __srcImg.mime || 'image/png' };
      cur.adMode = null; // صورة جديدة = وضع إعلان جديد
    }
    const __followUp = !__srcImg && cur.lastEditedImage && cur.lastMsgWasImageEdit;
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
    } else if(text && __srcImg && __adIntentRe.test(text) && !__codeWordRe.test(text) && !/(داخل|خارج|فوق الصور|تحت الصور)/i.test(text)){
      cur.awaitingAdMode = true; cur.pendingAdText = text; cur.adMode = null;
      cur.lastMsgWasImageEdit = true;
      cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? '📢 قبل أصمم الإعلان — تبي كتابة التفاصيل **داخل الصورة نفسها**، ولا **الصورة بروحها والتفاصيل خارجها**؟ رد بكلمة: داخل / خارج' : '📢 Before I design the ad — do you want the details **inside the photo itself**, or **the photo alone with the details outside it**? Reply: inside / outside') });
      renderAll(); saveState();
      return;
    } else if(text && (__srcImg || __followUp) && /(لوجو|شعار|logo|أيقون|ايقون|صمم|صمّم|تصميم|بطاقة|دعوة|بوستر|غلاف|بنر|نفس هذ|design)/i.test(text) && !cur.adMode && !cur.awaitingAdMode && text.indexOf('ملاحظة للنظام') === -1){
      // 🎨 v328: صورة/شعار مرفق + طلب تصميم → صورة المستخدم تُضمَّن كما هي — ممنوع إعادة رسمها
      text += '\n(ملاحظة للنظام: المستخدم أرفق صورة/شعارًا — إذا كان ردك تصميمًا أو كودًا يجب استخدام صورته نفسها كما هي عبر src="__USER_IMAGE__" أو background-image:url(\'__USER_IMAGE__\') بالضبط، والتطبيق يستبدلها بالصورة الحقيقية تلقائيًا. ممنوع منعًا باتًا استبدال صورة المستخدم بلوجو أو صورة من تصميمك أو من الإنترنت — صورة المستخدم هي الأصل الرسمي وتظهر بدون أي تشويه أو قلب أو قص)';
    }
    // 🖼️ صورة مرفقة بدون أي نص → نسأل المستخدم محليًا شو يبي (بدون أي استهلاك API)
    if(__srcImg && !(text || '').trim()){
      cur.lastEditedImage = { b64: (__srcImg.dataUrl || '').split(',')[1] || '', mime: __srcImg.mime || 'image/png' };
      cur.lastMsgWasImageEdit = true;
      cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? 'وصلتني الصورة 👍 شو تبي أسوي فيها؟ مثلًا: عدّلها، حوّلها ديكور جديد، اكتب عليها، سوّ منها فيديو، أو اسألني أي سؤال عنها.' : 'Got the image 👍 What would you like me to do with it? For example: edit it, redesign the decor, write on it, turn it into a video, or ask me anything about it.') });
      renderAll(); saveState();
      return;
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
        const __vp = { promptText: __talkPrompt.slice(0,1400), ratio: '720:1280', quality: 'high', durationSeconds: __tcDur, token: authGet('aiapp_auth_token'), imageBase64: __cartoonB64, imageMime: __cartoonMime };
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
        if(!(e && e.name === 'AbortError')){ cur.messages.push({ role:'assistant', content:'⚠️ ' + (e && e.message ? e.message : String(e)) }); }
      }
      cur.lastMsgWasImageEdit = false;
      renderAll(); saveState();
      return;
    }
    // 🏠 طلب توليد صورة جديدة انطلاقًا من صورة مرفقة (مثال: مخطط منزل + "عطني تصميم خارجي")
    const __imgGenIntentRe = /(عطني|أعطني|اعطني|هات|ابا|أبا|ابي|أبي|ابغي|أبغي|اريد|أريد|سو|سوي|سوّي|اعمل|أعمل|give me|make me|i want|show me)\s+(?:لي\s+)?.{0,20}?(تصميم|تصور|منظر|واجهة|صوره?|رسمة|شكل|design|render|view|image|picture|visual)/i;
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
          cur.messages.push({ role: 'assistant', content: '⚠️ ' + (e && e.message ? e.message : String(e)) });
        }
      }
      cur.lastMsgWasImageEdit = false;
      renderAll(); saveState();
      return;
    }
    if(text && !cur.adMode && (__IMG_FOLLOW || __imgEditRe.test(text) || __imgGenIntentRe.test(text) || /(شهادة|بطاقة|دعوة|بوستر|إعلان|اعلان|لوجو|شعار|بنر|غلاف|تصميم|للتواصل|poster|logo|banner|design)/i.test(text)) && !__codeWordRe.test(text) && (__srcImg || __followUp || __IMG_FOLLOW)){
      chatPhase('🖼️', lang === 'ar' ? 'جاري تعديل الصورة…' : 'Editing image…', thinkingDiv);
      const __b64 = __srcImg ? ((__srcImg.dataUrl || '').split(',')[1] || '') : cur.lastEditedImage.b64;
      const __mime = __srcImg ? (__srcImg.mime || 'image/png') : (cur.lastEditedImage.mime || 'image/png');
      // ✍️ إذا الطلب كتابة نص/اسم على الصورة → نرسمه محليًا بخط سليم (بدون Gemini)
      const __writeIntentRe = /(اكتب|أكتب|حط\s+(?:لي\s+)?(?:اسمي|اسم|كلمة|نص)|(?:ضيف|أضف|اضف)\s+(?:لي\s+)?(?:اسمي|اسم|كلمة|نص)|write|put\s+(?:my\s+)?name|add\s+(?:the\s+)?text)/i;
      if(__writeIntentRe.test(text)){
        const __txt = extractOverlayText(text);
        if(__txt){
          try{
            const __outB64 = await overlayTextOnImage(__b64, __mime, __txt);
            cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? 'تمت كتابة النص على الصورة ✅ اضغط عليها للتكبير، وتقدر تطلب تعديلات إضافية.' : 'Text added to the image ✅ Tap to enlarge — you can request more edits.'), attachments: [{ name: 'edited.png', isImage: true, mime: 'image/png', dataUrl: 'data:image/png;base64,' + __outB64 }] });
            cur.lastEditedImage = { b64: __outB64, mime: 'image/png' };
            cur.lastMsgWasImageEdit = true;
            renderAll(); saveState();
            return;
          }catch(e){ /* فشل الرسم المحلي → نكمل عبر Gemini */ }
        }
      }
      let __data = {}; let __ok = false;
      for(let __try = 0; __try < 2 && !__ok; __try++){
        const __res = await fetch('/api/maha-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: genAbortController.signal,
          body: JSON.stringify({ prompt: text, editImageBase64: __b64, editMimeType: __mime, extraImages: imageAttachments.length > 1 ? imageAttachments.slice(0, -1).map(a => ({ data: (a.dataUrl || '').split(',')[1] || '', mime: a.mime || 'image/png' })) : undefined, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
        });
        __data = await __res.json().catch(() => ({}));
        __ok = __res.ok && !!__data.imageBase64;
        if(!__ok && !__data) __data = {};
        if(!__ok) __data.__status = __res.status;
      }
      if(__ok){
        const __outMime = __data.mimeType || 'image/png';
        cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? 'تم تعديل الصورة ✅ اضغط عليها للتكبير، وتقدر تطلب تعديلات إضافية عليها مباشرة.' : 'Image edited ✅ Tap it to enlarge — you can keep requesting more edits.'), attachments: [{ name: 'edited.png', isImage: true, mime: __outMime, dataUrl: 'data:' + __outMime + ';base64,' + __data.imageBase64 }] });
        cur.lastEditedImage = { b64: __data.imageBase64, mime: __outMime };
        cur.lastMsgWasImageEdit = true;
      } else {
        cur.messages.push({ role: 'assistant', content: imgErrFriendly(__data && __data.error, lang === 'ar') || ((lang === 'ar' ? '⚠️ تعذر تعديل الصورة: ' : '⚠️ Image edit failed: ') + ((__data && __data.error) || ('HTTP ' + (__data.__status || '?')))) });
        cur.lastMsgWasImageEdit = false;
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
    const __txtOnlyImgRe = /(تصور|منظور|بورتريه|ارسم|أرسم|ارسمي|رسمة|معماري|معمارية|واجهات\s|تصميم\s*(?:لي\s*)?صوره?|صمم\s*(?:لي\s*)?صوره?|توليد\s*صوره?|(?:انشئ|أنشئ|انشاء|إنشاء|اصنع)\s*(?:لي\s*)?صوره?|صوره?\s*(?:من|عن)\s*الخيال|خيال\s*علمي|render|perspective|elevation|concept\s?art|\bdraw\b|\bpainting\b)/i;
    if(text && !__srcImg && !__followUp && !__archImagesDone && !__codeWordRe.test(text) && !__designDocRe.test(text) &&
       (__txtOnlyImgRe.test(text) || (__imgGenIntentRe.test(text) && /صور|رسمة|منظر|تصور|image|picture|visual/i.test(text)))){
      if(!__txtOnlyImgRe.test(text) && __isVagueMediaRequest(text)){
        cur.messages.push({ role: 'assistant', content: lang === 'ar' ? 'صورة عن شو؟ وصفلي اللي تبيه 🖼️' : 'An image of what? Describe what you want 🖼️' });
        renderAll(); saveState();
        thinkingDiv && thinkingDiv.remove();
        return;
      }
      chatPhase('🖼️', lang === 'ar' ? 'جاري إنشاء الصورة…' : 'Generating image…', thinkingDiv);
      let __gData = {}; let __gOk = false;
      try{
        for(let __t2 = 0; __t2 < 2 && !__gOk; __t2++){
          const __gRes = await fetch('/api/maha-image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: genAbortController.signal,
            body: JSON.stringify({ prompt: text.slice(0, 490), token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
          });
          __gData = await __gRes.json().catch(() => ({}));
          __gOk = __gRes.ok && !!__gData.imageBase64;
          if(!__gOk){ if(!__gData) __gData = {}; __gData.__status = __gRes.status; }
        }
      }catch(e){
        if(e && e.name === 'AbortError'){ renderAll(); saveState(); return; }
        __gData = { error: (e && e.message) ? e.message : String(e) };
      }
      if(__gOk){
        const __gm = __gData.mimeType || 'image/png';
        cur.messages.push({ role: 'assistant', content: (lang === 'ar' ? 'هذي الصورة اللي طلبتها ✅ اضغط عليها للتكبير، وتقدر تطلب تعديلات عليها مباشرة.' : 'Here is your image ✅ Tap to enlarge — you can request edits directly.'), attachments: [{ name: 'generated.png', isImage: true, mime: __gm, dataUrl: 'data:' + __gm + ';base64,' + __gData.imageBase64 }] });
        cur.lastEditedImage = { b64: __gData.imageBase64, mime: __gm };
        cur.lastMsgWasImageEdit = true;
      } else {
        cur.messages.push({ role: 'assistant', content: imgErrFriendly(__gData && __gData.error, lang === 'ar') || ((lang === 'ar' ? '⚠️ تعذر إنشاء الصورة: ' : '⚠️ Image generation failed: ') + ((__gData && __gData.error) || ('HTTP ' + (__gData.__status || '?')))) });
        cur.lastMsgWasImageEdit = false;
      }
      renderAll(); saveState();
      return;
    }
    cur.lastMsgWasImageEdit = false;
    // v464 — حقن ذكي: قواعد البناء الثقيلة تُرسل فقط عند طلب بناء/تصميم فعلي.
    // الأسئلة العادية تحصل على system prompt خفيف = ردود أفضل + ما يشفّر.
    const __bldRe = /(ابني|ابن\s|بناء|نبني|اعمل|أعمل|سوي|سوّي|سو\b|سوّ\b|صمم|صمّم|انشئ|أنشئ|انشاء|إنشاء|اصنع|عدل|عدّل|طور|طوّر|اضف|أضف|كمل|أكمل|build|create|make|design|develop|fix|add|update|improve)/i;
    const __appWd = /(تطبيق|موقع|لعبة|برنامج|بوت|صفحة|أداة|app|website|game|bot|page|tool|clone)/i;
    const __dsnRe = /(إعلان|بوستر|شهادة|بطاقة|دعوة|لوجو|شعار|بنر|غلاف|منشور|poster|flyer|certificate|card|invitation|logo|banner|cover)/i;
    const __needsBuild = (__bldRe.test(text) && __appWd.test(text)) || __dsnRe.test(text) || !!cur.code || !!window.__buildOfferApproved;
    // v469: Q&A = بروم خفيف مثل ChatGPT؛ البناء = تعليمات كاملة.
    let __sys;
    if(__needsBuild){
      __sys = t('systemPrompt') + APP_IDENTITY_NOTE + TOPIC_FOLLOW_RULE + BUILD_COMPLETENESS_RULE + NO_FAKE_EDIT_RULE + CHAT_STYLE_RULE + APP_CAPABILITY_RULE;
      if(__dsnRe.test(text)) __sys += DESIGN_POSTER_RULE;
    } else {
      __sys = 'أنت مساعد ذكي في تطبيق Omran AI من فريق عمران AI. أجب بلغة المستخدم ولهجته بعمق وخبرة وطبيعية.\n' +
        '(1) ادخل بصلب الموضوع من أول كلمة — بدون مقدمات. سؤال بسيط = 1-3 جمل. موضوع متشعب = رد منظم بعناوين.\n' +
        '(2) كن صادقًا 100%: إذا ما تعرف قل ما أعرف. ممنوع اختراع أرقام هواتف أو روابط URL.\n' +
        '(3) تأكيد قصير (نعم/تمام/يلا/اوك) بعد سؤالك = موافقة — جاوب فورًا.\n' +
        '(4) ممنوع مناداة المستخدم بأي اسم إلا إذا محفوظ بالذاكرة.\n' +
        '(5) رسالة قصيرة (كلمة/كلمتين) = تكملة للموضوع السابق.\n' +
        '(6) وضع نقاش — ممنوع عرض كود إلا إذا طُلب صراحة.\n' +
        '(7) التطبيق يوفّر توليد صور وفيديو وPDF — أرشد إليها بدل "ما أقدر".\n' +
        '(8) العربية: لهجتك الافتراضيّة إماراتيّة بيضاء مفهومة للجميع (هلا والله · أبشر · على طول · شو تحب · تسلم) بلا مبالغة ولا كلمات غامضة. اللغات الأخرى = أسلوب طبيعي بلغة المستخدم بلا لهجة عربية.\n' +
        '(9) جارِ لهجة المستخدم العربية: كتب مصري = ردّ مصري · شامي = شامي · سعودي = سعودي · مغاربي = مغاربي · عراقي = عراقي · فصحى = فصحى مبسّطة. الإماراتيّة هي الافتراضيّ فقط.\n' +
        '(10) جارِ شخصيّته: مختصر = اختصر · يمزح = مازحه بخفّة · رسميّ = كن رسميًّا · كبير في السنّ أو مرتبك = اصبر وبسّط. المصطلحات والأسماء والأرقام تبقى كما هي — اللهجة في الكلام لا في المحتوى.';
    }
    const apiMessages = [{role: 'system', content: __sys}];
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
    // 🧠 حقن ذاكرة المستخدم طويلة المدى
    // v548: تحية صافية ⇒ لا حقن ذاكرة في هذا الدور وحده — الذاكرة كانت تجعل
    // الرد يستعرض مواضيع المستخدم المحفوظة على مجرد «هلا». الأسئلة العادية بلا تغيير.
    const __memMsg = isPureGreeting(text) ? null : memorySystemMsg();
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
      __historyMsgs = __historyMsgs.filter((m, __i) => __i >= __keepFrom || !(m.role === 'user' && __historyBuildRe.test(m.apiText !== undefined ? m.apiText : (m.content || ''))));
    }
    // 🔒 الصور تُرسل فقط مع الرسالة الحالية (الأخيرة) — صور الرسائل القديمة
    // لا تُعاد إرسالها أبدًا حتى لا يظل المزود يحلل صورة قديمة بدل السؤال الجديد.
    {
      // 🔒 منع تداخل المواضيع نهائيًا: الرسائل القديمة تُضغط في رسالة سياق
      // واحدة مقفلة (للمرجعية فقط)، والسؤال الأخير يُرسل وحده كرسالة مستخدم
      // وحيدة — فلا يستطيع أي مزود "اختيار" موضوع قديم والرد عليه.
      const __h = __historyMsgs.slice(-20); // ✅ v325: ذاكرة موسعة — آخر 20 رسالة
      // ✅ v301: الرسالة الأخيرة المرسلة للمزود يجب أن تكون رسالة المستخدم —
      // بعد المسار المعماري تكون آخر رسالة في المحادثة رسالة صور (مساعد)،
      // وإرسالها كآخر رسالة يسبّب خطأ 400 من Claude (messages فارغة بعد التصفية).
      let __lastUi = __h.length - 1;
      while(__lastUi > 0 && __h[__lastUi].role !== 'user') __lastUi--;
      if(!__h[__lastUi] || __h[__lastUi].role !== 'user') __lastUi = __h.length - 1;
      const __lastM = __h[__lastUi];
      const __prev = __h.filter((m, __pi) => __pi !== __lastUi);
      if(__prev.length){
        const __ctx = __prev.map(m => {
          let __txt = String(__stripCodeForHistory(m.role, (m.apiText !== undefined ? m.apiText : m.content)) || '');
          __txt = __txt.replace(/\b\S+\.(jpg|jpeg|png|webp|gif)\b/gi, '(صورة قديمة)');
          if(__txt.length > 2500) __txt = __txt.slice(0, 1600) + ' … ' + __txt.slice(-800); // ✅ v325: الرسائل تروح شبه كاملة — القص فقط للردود الطويلة جدًا
          return (m.role === 'user' ? 'المستخدم: ' : 'المساعد: ') + __txt;
        }).join('\n');
        apiMessages.push({role: 'system', content: '📜 المحادثة السابقة بينك وبين المستخدم:\n' + __ctx + '\n\n✅ هذه ذاكرتك: استخدمها لفهم سؤال المستخدم الأخير والاستمرار معه في نفس الموضوع بشكل طبيعي (الأسئلة المتصلة تكمل الموضوع الجاري). إذا سألك «عن شو كنا نتكلم؟» أجبه بدقة من المحادثة أعلاه.\n⛔ الممنوع الوحيد: لا تفتح موضوعًا قديمًا من نفسك إذا كان سؤاله الجديد غير متعلق به، ولا تقترح متابعته («تبي نكمل…؟»). أجب عن رسالته الأخيرة وحدها. ممنوع بدء ردك بأي تحية (السلام عليكم/صباح الخير/مرحبا) — المحادثة مستمرة؛ ادخل في الجواب مباشرة.'});
      }
      if(__lastM) apiMessages.push({role: __lastM.role, content: (__lastM.apiText !== undefined ? __lastM.apiText : __lastM.content), images: (__lastM.role === 'user') ? __lastM.apiImages : undefined});
    }

    // 🔍 قراءة وتحليل قوي للصور المرفقة: تعليمة رؤية شاملة تُحقن فقط عند وجود صورة
    if(imageAttachments.length){
      apiMessages.push({role: 'system', content: 'صورة مرفقة — طبّق تحليلًا قويًا وشاملًا:\n1) اقرأ كل نص ظاهر في الصورة حرفيًا كما هو (عربي أو إنجليزي أو أي لغة) واذكره كاملًا بدون تلخيص.\n2) حلّل الصورة بعمق: العناصر، الأشخاص، الألوان، المكان، السياق، الأرقام، الجداول، أي أخطاء أو ملاحظات مهمة، واستنتاجاتك.\n3) إذا سأل المستخدم سؤالًا محددًا عن الصورة فأجب عنه بعمق وتفصيل أولًا ثم أضف الملاحظات المهمة.\n4) لا تقل أبدًا "لا أستطيع رؤية الصورة" — الصورة أمامك، حلّلها مباشرة.'});
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
    // 👋 قاعدة التحية لكل المزودين التسعة: تحية = رد ترحيبي قصير فقط،
    // ممنوع البحث وممنوع المصادر وممنوع فتح أي موضوع قديم من المحادثة.
    if(isPureGreeting(text)){
      apiMessages.push({role: 'system', content: 'رسالة المستخدم الأخيرة مجرد تحية. رُدّ بسطر واحد قصير جدًا يحيّه ويسأله وش يحتاج، بلهجة إماراتية طبيعية بلا تكلّف — وإذا حيّاك بلهجة أخرى (مصري/شامي/سعودي/مغاربي) أو بالإنجليزي فجاوبه بنفس لهجته ولغته. ⚠️ ممنوع منعًا باتًا في هذا الرد: أي اقتراح أو عرض خدمات أو أمثلة على ما تقدر تسويه (لا مطاعم ولا أسعار ولا ذهب ولا تصميم ولا نماذج ولا عبارة «أو أي شيء آخر»)، أي معلومة أو رقم أو رابط أو مصدر، أي موضوع سابق من المحادثة أو من ذاكرة المستخدم، وأي سؤال إضافي بعد «وش تحتاج». وممنوع العبارات الفصحى الجاهزة مثل «كيف يمكنني مساعدتك اليوم؟». ممنوع مناداة المستخدم بأي اسم.'});
    }
    // v311: أثناء تصميم إعلان (adMode مفعّل) ممنوع البحث الحي نهائيًا —
    // تفاصيل «بيت للبيع...» تكمل التصميم ولا تتحول لبحث دوبيزل.
    // v327: صورة مرفقة = تحليل/تصميم — ممنوع البحث الحي (كان يجيب صور بحث بلا علاقة).
    if(!__curIsBuildTask && !cur.adMode && !cur.awaitingAdMode && !imageAttachments.length){
      // v384: مؤشر بحث عميق — يظهر للمستخدم أن البحث جاري
      const __deepRe384 = /بحث عميق|بحث شامل|تقرير مفصل|تحليل شامل|قارن بين|مقارنة.*بين|أفضل\s*(خيارات|بدائل|مواقع|شركات|تطبيقات)|deep research|comprehensive|detailed report|compare.*between/i;
      let __searchIndicator = null;
      if(__deepRe384.test(text)){
        __searchIndicator = { role: 'assistant', content: lang === 'ar' ? '🔍 يبحث بعمق…' : '🔍 Deep searching…', _loading: true };
        cur.messages.push(__searchIndicator);
        renderMessages(true);
      }
      __searchData = await smartMaybeSearch(text, cur.messages.filter(m => m !== __searchIndicator));
      if(__searchIndicator){
        cur.messages = cur.messages.filter(m => m !== __searchIndicator);
        renderMessages(true);
      }
      if(__searchData){
        apiMessages.push({role: 'system', content: __searchData.note});
        // 🔒 سؤال معلوماتي (تذكرة/سيارة/وظيفة/سعر...) = جواب نصي فقط —
        // ممنوع منعًا باتًا بناء تطبيق/موقع/صفحة HTML أو إرجاع أي كود.
        apiMessages.push({role: 'system', content: 'This is an INFORMATION question, NOT a build request. Reply in plain conversational text only. STRICTLY FORBIDDEN: building any app/site/booking page/HTML page or returning any code block. Just answer with the real information and links from the search results.'});
      }
    }

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
      const REVEAL_CHARS_PER_TICK = 2;
      const REVEAL_TICK_MS = 35;
      const ensureRevealTimer = (msg) => {
        let st = revealStates.get(msg._uid);
        if(!st){
          st = { target: '', shown: 0, done: false, timer: null };
          revealStates.set(msg._uid, st);
        }
        if(!st.timer){
          st.timer = setInterval(() => {
            if(st.shown < st.target.length){
              st.shown = Math.min(st.target.length, st.shown + REVEAL_CHARS_PER_TICK);
              // v310: msg.content يحمل النص الكامل دائمًا — الحركة عرض فقط.
              // قبل: كان يُحفظ المقطع الجزئي، ولو سُكِّر التطبيق قبل نهاية
              // الحركة ينحفظ الرد مقطوعًا للأبد (سبب الردود الناقصة بالآيفون).
              msg.content = st.target;
              const el = messagesEl.querySelector('[data-askuid="' + msg._uid + '"]');
              if(el) el.textContent = st.target.slice(0, st.shown);
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
        };
        try{
          const reply = await callWithWatchdog(p.key, apiMessages, onDelta, 75000, 180000);
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
          msg.content = '⚠️ ' + msg.providerLabel + ': ' + err.message;
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
            { role: 'system', content: t('mergedAnswerSystemPrompt') + '\n[قاعدة إلزامية]: أثناء الدمج ممنوع حذف أي بيانات ملموسة وردت في الإجابات: روابط الإعلانات المباشرة، الأسعار، أرقام الهواتف، أسماء المناطق. إذا احتوت الإجابات على إعلانات حقيقية (عقارات/سيارات/وظائف) بروابط، اعرضها في الإجابة النهائية كقائمة منظمة: العنوان + السعر + المنطقة + الرابط المباشر — ممنوع استبدالها بنصيحة عامة مثل "ادخل الموقع وابحث".' + APP_IDENTITY_NOTE + CHAT_STYLE_RULE },
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
      const onDelta = (partial) => {
        onDelta._p = partial;
        if(onDelta._raf) return;
        onDelta._raf = requestAnimationFrame(() => {
          onDelta._raf = null;
          const __desktopRhythm = !document.documentElement.classList.contains('mobile-ui');
          const __followReply = __desktopRhythm && typeof chatIsNearBottom === 'function' ? chatIsNearBottom() : true;
          (function(){ try{ if(window.__chatStatus) window.__chatStatus.release(); }catch(e){ __swallow(e, "misc:app-09-attach#26"); } })();
          if(__desktopRhythm){
            renderStreamingAssistant(thinkingDiv, liveStripCode(onDelta._p));
            smartScrollBottom(__followReply);
          } else {
            // سلوك الجوال السابق كما هو؛ هذه المرحلة لسطح المكتب فقط.
            thinkingDiv.textContent = liveStripCode(onDelta._p);
            try{
              const __mobileGap = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
              if(__mobileGap < 140) messagesEl.scrollTop = messagesEl.scrollHeight;
            }catch(e){ __swallow(e, "misc:app-09-attach#26-mobile"); }
          }
        });
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
      const __effProv = __convLockProvider(cur, __effProv0, !!(__gateNoBuild || __routeFix || __visionOverride), __respectExplicit);
      // v405: التحويل يُعلَن بدل الصمت — المستخدم يرى مزودًا غير الذي اختاره فيظن الاختيار معطّلًا.
      try{
        var __selLabel = (typeof functionalLabel === 'function') ? functionalLabel(__selProv) : __selProv;
        if(__effProv !== __selProv && window.__chatStatus && !window.__chatStatus.isReleased()){
          var __why = (__gateNoBuild || __routeFix) ? 'البناء وتعديل الكود'
                    : (__visionOverride ? 'قراءة الصور' : 'هذا النوع من الطلبات');
          window.__chatStatus.note('↪️', (__provUiHidden() ? 'محادثتك على ' : 'اخترتَ ') + __selLabel + ' — و' + __why + ' يُنفَّذ بـ ' +
            ((typeof functionalLabel === 'function') ? functionalLabel(__effProv) : __effProv) +
            ' لأنه الأدقّ فيه. محادثتك العادية تبقى على ' + __selLabel + '.');
        }
      }catch(e){ __swallow(e, 'ui:switchnote'); }
      const __teamOrder = [__effProv, ...(__routeFix ? ['claude', 'openai', 'gemini'] : ['claude', 'openai', 'gemini']).filter(p => p !== __effProv)];
      window.__claudeModelOverride = null;
      window.__claudeThinking = !__routeFix && __selProv === 'claude'; // 🧠 تفكير داخلي قبل الرد في النقاش العادي (Claude فقط)
      // 🛠️ v468: البوّابة تعلو على اليد — في دور الاستئذان لا تُمرَّر الأدوات
      // إطلاقًا، وإلّا غلبت تعليمة «ابنِ ولا تستأذن» داخل chat.js. بعد الموافقة
      // يسقط __gateNoBuild فتعمل اليد كاملة (صور + كود + تجربة).
      const __toolsWillRun = (window.__chatToolsOn !== false && !__routeFix && (!__gateNoBuild || !!__gateApprovedText) && !imageAttachments.length
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
      // 💬 عقل واحد: Claude وحده يرد في النقاش العادي — الاحتياط (GPT ثم Gemini)
      // صامت ويشتغل فقط إذا Claude تعطل أو خلص حده.
      // 🛠️ ومعه يداه: النقاش العادي على Claude يمرّ بحلقة الأدوات (بحث · قراءة
      // صفحة · تشغيل كود)، فيقرّر النموذج بنفسه متى يحتاج أداة بدل أن تقرّر
      // عنه أنماط نصّيّة في المتصفّح. أيّ عثرة تهبط صامتة إلى المسار القديم.
      try{
        let __ct = null;
        if(__toolsWillRun){
          try{ __ct = await window.callChatWithTools(apiMessages, onDelta, __effProv); }
          catch(e){ if(e && e.name === 'AbortError') throw e; __ct = null; __swallow(e, 'chat:tools'); }
        }
        if(__ct){ __ctUsed = true; ({ reply, providerKey, switched, requestedKey } = __ct); }
        else ({ reply, providerKey, switched, requestedKey } = await callAIWithFallback(apiMessages, onDelta, __teamOrder));
      }finally{
        window.__claudeModelOverride = null;
        window.__claudeThinking = false;
      }
      let { code, explanation, codeType } = extractReply(reply);
      // v467: ما تبنيه يد المحادثة يُعرض في المعاينة كأي بناء — وإلّا بقي
      // الموقع حبيس فقاعة نصّيّة لا تُرى.
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
      cur.messages.push({role: 'assistant', content: (code ? stripCodeFromChat(explanation) : explanation) || (code ? t('buildSuccess') : ''), code: code || null, providerLabel, providerKey, askAllReply: false,
        // ✅ v535: عادت المصادر والصور إلى المحادثة (إلغاء إطفاء v368).
        sources: (!__clarifyQ && __searchData && __searchData.sources) || undefined,
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
      // User pressed ⏹️ to cancel: drop the just-sent message and put its
      // text back in the box so they can fix it and resend.
      const lastMsg = cur.messages[cur.messages.length - 1];
      if(lastMsg && lastMsg.role === 'user'){
        cur.messages.pop();
      }
      promptEl.value = text;
    } else if(err && err.premiumNoPoints){
      // 👑 نفاد النقاط أثناء الرد الاحترافي: رسالة ودّية + طريقة لشراء نقاط،
      // وإطفاء الوضع الاحترافي حتى تكون الرسالة التالية مجانية.
      window.__premiumOn = false;
      try{ if(typeof updatePremiumToggleVisibility === 'function') updatePremiumToggleVisibility(); }catch(_){ __swallow(_, "points:app-09-attach#28"); }
      try{ settingsToast(t('premiumNoPoints')); }catch(_){ __swallow(_, "points:app-09-attach#29"); }
      try{ if(typeof openPremiumBuyPoints === 'function') openPremiumBuyPoints(); }catch(_){ __swallow(_, "points:app-09-attach#30"); }
    } else {
      cur.messages.push({role: 'assistant', content: '⚠️ ' + err.message});
    }
  }finally{
    const __keepReaderPosition = !document.documentElement.classList.contains('mobile-ui') && typeof chatIsNearBottom === 'function' ? !chatIsNearBottom() : false;
    genAbortController = null;
    btnStop.classList.remove('live');
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px;display:block"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
    saveState();
    renderAll(__keepReaderPosition);
    // 🧠 تحديث ذاكرة المستخدم بعد اكتمال الرد (بدون انتظار)
    try{
      const __lastA = cur.messages.filter(m => m.role === 'assistant').slice(-1)[0];
      if(__lastA && __lastA.content && !String(__lastA.content).startsWith('⚠️')){
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
  try{
    const migrated = localStorage.getItem('aiapp_idb_on') === '1';
    if(!migrated){
      // أول تشغيل: بيانات localStorage هي المصدر → ننسخها إلى IndexedDB ثم نحرر المساحة.
      const idbOld = await idbGet('aiapp_projects');
      const merged = Array.isArray(idbOld) && idbOld.length
        ? idbOld.filter(p => !state.projects.some(q => q.id === p.id)).concat(state.projects)
        : state.projects;
      state.projects = merged;
      await idbSet('aiapp_projects', JSON.parse(JSON.stringify(merged)));
      localStorage.setItem('aiapp_idb_on', '1');
      try{ localStorage.removeItem('aiapp_projects'); }catch(e){ __swallow(e, "save:app-09-attach#33"); }
      renderAll();
    } else {
      const idbProjects = await idbGet('aiapp_projects');
      if(Array.isArray(idbProjects) && idbProjects.length){
        // دمج أي مشاريع أنشئت قبل اكتمال التحميل (نادر) بدون فقدان.
        const extra = state.projects.filter(p => !idbProjects.some(q => q.id === p.id));
        state.projects = idbProjects.concat(extra);
        renderAll();
      }
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
