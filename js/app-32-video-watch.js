/* v-video-watch (طلب المالك ٥ أكتوبر: «يشوف الفيديو مع الصوت نفس الوقت»، «بدون أيّ أزرار»، «الدقّة العالية»): فيديو يُرفق من 📎
   في المحادثة (أو بالسحب) يصير شريحة 🎬 بمدّته — كان يسقط في الفرع الأخير فيُقرأ نصًّا ثنائيًّا ويُرسل مرفقًا نصّيًّا. عند الإرسال
   يُرفع قطعًا عبر /api/video?action=video-watch (api/_lib/video-watch.js) إلى محرّك يشاهده ويسمعه معًا، وسؤال المستخدم هو الطلب
   (بلا سؤال = وصف كامل بالتوقيت وتفريغ الكلام). الخصم تلقائيّ بالمدّة الحقيقيّة (نقطة + نقطتان لكلّ دقيقة) بلا نافذة تأكيد،
   وسطره تحت الردّ؛ فشل التحليل يردّه. الحدّ ١٠٠MB و١٠ دقائق. */
(function(){
  var MAX_BYTES = 100 * 1024 * 1024, MAX_SEC = 600;
  var EXT_RE = /\.(mp4|m4v|mov|webm|3gp|mpe?g|avi|wmv|flv)$/i;
  function isVideoFile(f){ return !!f && (/^video\//i.test(f.type || '') || EXT_RE.test(f.name || '')); }
  function fmtDur(sec){
    var all = Math.max(0, Math.round(Number(sec) || 0)), s = all % 60;
    return Math.floor(all / 60) + ':' + (s < 10 ? '0' : '') + s;
  }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function readDuration(blob){
    return new Promise(function(resolve){
      var url = '', done = false;
      function fin(d){
        if(done) return; done = true;
        try{ if(url) URL.revokeObjectURL(url); }catch(e){ __swallow(e, 'vwatch:revoke'); }
        resolve(isFinite(d) && d > 0 ? d : 0);
      }
      try{
        url = URL.createObjectURL(blob);
        var v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        v.onloadedmetadata = function(){ fin(v.duration); };
        v.onerror = function(){ fin(0); };
        setTimeout(function(){ fin(0); }, 8000);
        v.src = url;
      }catch(e){ fin(0); }
    });
  }
  // البايتات تُقرأ لحظة الاختيار: بعض المتصفّحات تفصل الملفّ بعد مسح حقل الاختيار (درس v405 في مسار الأرشيف).
  async function makeAttachment(file){
    var name = file.name || 'video.mp4';
    if(file.size > MAX_BYTES) return { name: name, isImage: false, error: true, text: '⚠️ ' + name + ': ' + t('vwTooBig') };
    var blob = new Blob([await file.arrayBuffer()], { type: file.type || '' });
    var dur = await readDuration(blob);
    if(dur > MAX_SEC + 2) return { name: name, isImage: false, error: true, text: '⚠️ ' + name + ': ' + t('vwTooLong') };
    return { name: name, isImage: false, isVideoWatch: true, blob: blob, mime: file.type || '', size: file.size, durationSec: dur, label: name + (dur ? ' · ' + fmtDur(dur) : '') };
  }
  function b64(buf){
    var bytes = new Uint8Array(buf), s = '';
    for(var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function api(step, payload){
    var r = await fetch('/api/video?action=video-watch&step=' + step, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: authGet('aiapp_auth_token') || '' }, payload)),
    });
    var d = await r.json().catch(function(){ return {}; });
    return { status: r.status, d: d || {} };
  }
  function errText(d){
    var c = d && d.error;
    if(c === 'auth') return t('vwLogin');
    if(c === 'too_big') return t('vwTooBig');
    if(c === 'too_long') return t('vwTooLong');
    if(c === 'format') return t('vwFormat');
    if(c === 'points_insufficient') return t('vwNoPoints').replace('{p}', String(d.points || 0)).replace('{n}', String(d.needed || ''));
    return t('vwFailed');
  }
  async function watch(text, att, status){
    var s = await api('start', { size: att.size, mime: att.mime, name: att.name, durationSec: att.durationSec });
    if(!s.d.ok) return '⚠️ ' + errText(s.d);
    var id = s.d.id, chunk = Number(s.d.chunk) || 2621440, off = 0;
    while(off < att.size){
      var data = b64(await att.blob.slice(off, Math.min(att.size, off + chunk)).arrayBuffer());
      var r = null;
      for(var k = 0; k < 3; k++){ // عطل شبكة أو 5xx: القطعة نفسها بالإزاحة نفسها
        try{ r = await api('chunk', { id: id, offset: off, data: data }); }catch(e){ r = null; }
        if(r && r.status < 500) break;
        await sleep(1500 * (k + 1));
      }
      if(!r) return '⚠️ ' + t('vwFailed');
      if(r.status === 409 && isFinite(r.d.expected)){ off = Number(r.d.expected); continue; }
      if(!r.d.ok) return '⚠️ ' + errText(r.d);
      off = Number(r.d.offset) || att.size;
      status(t('vwUploading') + ' ' + Math.min(99, Math.floor(off * 100 / att.size)) + '%');
      if(r.d.done) break;
    }
    status(t('vwWatching'));
    for(var i = 0; i < 80; i++){ // pending (المحرّك يجهّز الملفّ) أو busy (تشغيل سابق لم ينتهِ) ← انتظار ثمّ إعادة؛ النتيجة محفوظة بلا خصم ثانٍ
      var q = null;
      try{ q = await api('run', { id: id, prompt: text, lang: lang }); }catch(e){ q = null; }
      if(q && q.d.ok && !q.d.pending){
        return String(q.d.result || '') + (q.d.cost ? '\n\n' + t('vwCharged').replace('{n}', String(q.d.cost)).replace('{d}', fmtDur(q.d.sec)) : '');
      }
      if(q && !q.d.ok && q.d.error !== 'busy') return '⚠️ ' + errText(q.d);
      await sleep(3000);
    }
    return '⚠️ ' + t('vwFailed');
  }
  async function send(text, att){
    if(!att) return;
    var cur = getCurrent();
    if(!cur){ // أوّل رسالة في تطبيق جديد — المحادثة تُنشأ كما في المسار العاديّ (كانت تعود بلا شيء؛ كشفتها اللقطة)
      var id = 'p_' + Date.now();
      cur = { id: id, title: '', messages: [], code: '', codeType: 'html' };
      state.projects.push(cur);
      state.currentId = id;
    }
    if(cur.messages.length === 0) cur.title = (text || att.name || '').slice(0, 30);
    var promptEl = $('#prompt'), sendBtn = $('#btnSend');
    // رسالة المستخدم بشريحة 🎬 خفيفة — بايتات الفيديو لا تدخل الحالة المحفوظة.
    cur.messages.push({ role: 'user', content: text || t('vwDefaultQ'), attachments: [{ name: att.name, isImage: false, isVideoWatch: true, label: att.label, durationSec: Math.round(att.durationSec || 0) }] });
    window.__chatEditRequest = null;
    try{ if(typeof setChatEditNotice === 'function') setChatEditNotice(false); }catch(e){ __swallow(e, 'vwatch:edit'); }
    if(promptEl) promptEl.value = '';
    try{ window.__promptAutoGrow && window.__promptAutoGrow(); }catch(e){ __swallow(e, 'vwatch:grow'); }
    pendingAttachments = pendingAttachments.filter(function(a){ return a !== att; });
    renderAttachStrip();
    document.body.classList.remove('omranWelcome');
    renderAll(); saveState();
    if(sendBtn) sendBtn.disabled = true;
    var box = document.createElement('div');
    box.className = 'msg assistant';
    box.textContent = t('vwUploading') + ' 0%';
    messagesEl.appendChild(box);
    try{ box.scrollIntoView({ block: 'end', behavior: 'smooth' }); }catch(e){ __swallow(e, 'vwatch:scroll'); }
    var reply = '';
    try{ reply = await watch(text, att, function(msg){ box.textContent = msg; }); }
    catch(e){ __swallow(e, 'vwatch:run'); reply = '⚠️ ' + t('vwFailed'); }
    finally{
      try{ box.remove(); }catch(e){ __swallow(e, 'vwatch:box'); }
      if(sendBtn) sendBtn.disabled = false;
    }
    cur.messages.push({ role: 'assistant', content: reply });
    renderAll(); saveState();
    try{ if(typeof window.refreshPointsWallet === 'function') window.refreshPointsWallet(); }catch(e){ __swallow(e, 'vwatch:wallet'); }
  }
  window.omranIsVideoFile = isVideoFile;
  window.omranVideoAttachment = makeAttachment;
  window.omranVideoWatchSend = send;
})();
