// ---- Voice chat: speech-to-text (mic) + auto-read replies ----
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;
const btnMic = $('#btnMic');
const btnVoiceChat = $('#btnVoiceChat');

localStorage.removeItem('aiapp_voice_chat_mode'); // القراءة التلقائية ملغاة — الوضع الصوتي لا يُحفظ بين الجلسات
btnVoiceChat.onclick = () => {
  const on = !btnVoiceChat.classList.contains('active');
  btnVoiceChat.classList.toggle('active', on);
};

// Aborts an in-flight AI generation request (set right before sending, cleared
// when the request settles). Also lets the same ⏹️ button stop TTS/mic.
let genAbortController = null;
// v310: يبدأ العداد من طابع زمني — الرسائل القديمة المحفوظة تحمل _uid من جلسات
// سابقة، ولو بدأنا من صفر يتصادم المعرف الجديد مع القديم فيُكتب نص البث داخل
// فقاعة قديمة غلط (سبب تداخل النصوص على الآيفون).
let askAllUidCounter = Date.now() % 2147483647;

const btnStop = $('#btnStop');
btnStop.onclick = () => {
  stopAllSpeaking();
  if(isListening && recognizer){ recognizer.stop(); }
  if(genAbortController){ genAbortController.abort(); }
};
// v246 — قسم الصوت المبسط: زران (رجل/امرأة) يحفظان الاختيار فورًا + زر تجربة.
function setVoiceGenderUI(val){
  document.querySelectorAll('.voiceGenderBtn').forEach(b => b.classList.toggle('active', b.dataset.gender === val));
}
document.querySelectorAll('.voiceGenderBtn').forEach(b => {
  b.onclick = () => {
    localStorage.setItem('aiapp_voice_gender', b.dataset.gender);
    setVoiceGenderUI(b.dataset.gender);
  };
});
const btnTestVoice = $('#btnTestVoice');
if(btnTestVoice){
  btnTestVoice.onclick = () => {
    const testTextByLang = {
      ar: 'مرحبًا، هذا اختبار للصوت.',
      en: 'Hello, this is a voice test.',
      fr: 'Bonjour, ceci est un test de la voix.',
      hi: 'नमस्ते, यह आवाज़ का परीक्षण है।',
      ur: 'ہیلو، یہ آواز کا امتحان ہے۔'
    };
    speakSmart(testTextByLang[lang] || testTextByLang.en, null, null, true);
  };
}
// ---- Mic: record audio (works on ALL devices: Android + iPhone + desktop) and
// send it to the server, which transcribes it via Groq Whisper. This replaces the
// old browser SpeechRecognition API, which is unsupported on iPhone Safari and
// unreliable on many Android browsers. ----
let mediaRecorder = null;
let recordedChunks = [];
let micStream = null;

let activeMicBtn = null;
async function startMicRecording(targetBtn){
  activeMicBtn = targetBtn || btnMic;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let mimeType = '';
  for(const cand of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cand)){ mimeType = cand; break; }
  }
  mediaRecorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);
  recordedChunks = [];
  mediaRecorder.ondataavailable = (e) => { if(e.data && e.data.size > 0) recordedChunks.push(e.data); };
  // timeslice=1000ms: collect audio progressively. On some Android/Chrome builds a
  // single final chunk gets truncated on stop(), so only the first 1-2 words survive.
  mediaRecorder.start(1000);
  isListening = true;
  activeMicBtn.classList.remove('maha-orb-idle');
  activeMicBtn.classList.add('recording');
}

function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function detectVoiceIntent(text){
  const s = (text || '').toLowerCase();
  const imageWords = ['صورة','صور ','ارسم','ارسمي','رسمة','رسمه','صمم صورة','صمّم صورة','اصنع صورة','سوي صورة','سوّي صورة','عطني صورة','picture','image','draw','photo'];
  const videoWords = ['فيديو','مقطع فيديو','فيديوهات','video','clip'];
  if(imageWords.some(w => s.includes(w))) return 'image';
  if(videoWords.some(w => s.includes(w))) return 'video';
  return 'code';
}

// Voice-tab image intent: no chat text is ever written - the generated image
// is dropped straight into the code/preview area (as a tiny self-contained
// HTML page showing it full-size), then a short spoken line confirms it.
async function handleVoiceImageIntent(promptText){
  let cur = getCurrent();
  if(!cur){
    const id = 'p_' + Date.now();
    cur = {id, title: (promptText || 'صورة').slice(0, 30), messages: [], code: '', codeType: 'html'};
    state.projects.push(cur);
    state.currentId = id;
  }
  try{
    const res = await fetch('/api/maha-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
    });
    const data = await res.json();
    if(!res.ok){
      await voiceTabSpeak(t('voiceImageFailed'));
      return;
    }
    const dataUrl = 'data:' + (data.mimeType || 'image/png') + ';base64,' + data.imageBase64;
    cur.code = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b12;}img{max-width:100%;max-height:100vh;display:block;}</style></head><body><img src="' + dataUrl + '" alt="' + promptText.replace(/"/g, '') + '"></body></html>';
    cur.codeType = 'html';
    renderAll();
    saveState();
    await voiceTabSpeak(t('voiceImageDone'));
  } catch(e){
    await voiceTabSpeak(t('voiceImageFailed'));
  }
}

// Voice-tab code/app intent: silently asks the AI to build/update the
// current project's code (same as typing a request), applies the resulting
// code straight to the code/preview panels - no chat bubble is ever created -
// then speaks one short confirmation line.
// Silently builds/updates the current project's code from a spoken
// description (no chat bubble, no TTS here) - shared by both the classic
// whisper voice-tab pipeline and the Maha-Realtime builder mode, which each
// handle their own spoken confirmation afterwards.
async function buildCodeFromPrompt(promptText){
  let cur = getCurrent();
  if(!cur){
    const id = 'p_' + Date.now();
    cur = {id, title: (promptText || 'مشروع').slice(0, 30), messages: [], code: '', codeType: 'html'};
    state.projects.push(cur);
    state.currentId = id;
  }
  try{
    // v464 — حقن ذكي: قواعد البناء فقط إذا الطلب صوتي فيه نية بناء.
    const __vBldRe = /(ابني|ابن\s|بناء|اعمل|أعمل|سوي|سوّي|صمم|انشئ|أنشئ|build|create|make|design)/i;
    const __vAppRe = /(تطبيق|موقع|لعبة|برنامج|بوت|app|website|game|bot)/i;
    const __vDsnRe = /(إعلان|بوستر|شهادة|بطاقة|poster|flyer|certificate|card|logo|banner)/i;
    const __vNeedsBuild = (__vBldRe.test(promptText) && __vAppRe.test(promptText)) || __vDsnRe.test(promptText) || !!cur.code;
    let __vSys = t('systemPrompt') + APP_IDENTITY_NOTE + CONVERSATION_QUALITY_RULE + TOPIC_FOLLOW_RULE;
    if(__vNeedsBuild){
      __vSys += BUILD_COMPLETENESS_RULE + NO_FAKE_EDIT_RULE + CHAT_STYLE_RULE + APP_CAPABILITY_RULE;
      if(__vDsnRe.test(promptText)) __vSys += DESIGN_POSTER_RULE;
    }
    const apiMessages = [{role: 'system', content: __vSys}];
    if(cur.code){
      apiMessages.push({role: 'assistant', content: '```' + (cur.codeType === 'python' ? 'python' : 'html') + '\n' + codeForApi(cur.code) + '\n```'});
    }
    apiMessages.push({role: 'user', content: promptText});
    const { reply } = await callAIWithFallback(apiMessages, null);
    const { code } = extractReply(reply);
    if(code){ cur.code = code; }
    renderAll();
    saveState();
    switchWorkTab('preview');
    return !!code;
  } catch(e){
    return false;
  }
}

async function handleVoiceCodeIntent(promptText){
  const ok = await buildCodeFromPrompt(promptText);
  await voiceTabSpeak(ok ? t('voiceCodeDone') : t('voiceCodeFailed'));
}

// Simple spoken confirmation used by the voice tab (cheap OpenAI TTS via our
// own /api/tts proxy) - not the full Maha Realtime pipeline, just one short
// line so the user gets an audible "done"/"failed" without ever seeing text.
async function voiceTabSpeak(text){
  if(!text) return;
  const btn = btnVoiceTabMic;
  if(btn) btn.classList.add('voice-speaking');
  try{
    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: localStorage.getItem('aiapp_cloud_voice_name') || 'nova', text: String(text).slice(0, 300) }),
    });
    if(resp.ok){
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
      URL.revokeObjectURL(url);
    }
  } catch(e){ /* silent - voice feedback is a nice-to-have, never block the UI */ }
  if(btn) btn.classList.remove('voice-speaking');
}

function handleVoiceVideoIntent(promptText){
  const btnOpenVideo = $('#btnVideoMaker');
  const videoPromptEl = $('#videoMakerPrompt');
  if(btnOpenVideo) btnOpenVideo.click();
  setTimeout(() => {
    if(videoPromptEl) videoPromptEl.value = promptText;
    const genBtn = $('#videoMakerGenerateBtn');
    if(genBtn) genBtn.click();
  }, 200);
}

async function stopMicRecordingAndTranscribe(autoRoute){
  if(!mediaRecorder) return;
  const btn = activeMicBtn || btnMic;
  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  const finished = new Promise((resolve) => { mediaRecorder.onstop = resolve; });
  mediaRecorder.stop();
  await finished;
  if(micStream){ micStream.getTracks().forEach(tr => tr.stop()); micStream = null; }
  isListening = false;
  btn.classList.remove('recording');
  btn.classList.add('transcribing');
  try{
    const blob = new Blob(recordedChunks, { type: mimeType });
    if(blob.size < 500){ btn.classList.remove('transcribing'); return; } // too short / no audio
    const audioBase64 = await blobToBase64(blob);
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType, lang, langHint: (autoRoute ? undefined : lang), token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
    });
    const data = await res.json();
    btn.classList.remove('transcribing');
    if(!res.ok){
      alert(data && data.error ? data.error : t('micNotSupported'));
      return;
    }
    const transcript = (data && data.text ? data.text : '').trim();
    if(!transcript) return;
    const promptEl = $('#prompt');
    if(!autoRoute){
      // Original behavior: just fill the textbox, user reviews & sends manually.
      promptEl.value = (promptEl.value ? promptEl.value + ' ' : '') + transcript;
      promptEl.dispatchEvent(new Event('input', { bubbles: true }));
      promptEl.focus();
      return;
    }
    // Voice-tab mode: detect intent and route automatically. Nothing is ever
    // typed/shown as text anywhere - only the resulting code/image/video
    // appears in the preview, plus a short spoken confirmation at the end.
    const combinedText = transcript;
    const intent = detectVoiceIntent(transcript);
    btn.classList.add('transcribing');
    try{
      if(intent === 'image'){
        await handleVoiceImageIntent(combinedText);
      } else if(intent === 'video'){
        await voiceTabSpeak(t('voiceVideoStarted'));
        handleVoiceVideoIntent(combinedText);
      } else {
        await handleVoiceCodeIntent(combinedText);
      }
    } finally {
      btn.classList.remove('transcribing');
      btn.classList.add('maha-orb-idle');
    }
  } catch(e){
    btn.classList.remove('transcribing');
    alert(t('micNotSupported'));
  }
}

btnMic.onclick = async () => {
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){
    alert(t('micNotSupported'));
    return;
  }
  if(isListening){
    stopMicRecordingAndTranscribe(false);
    return;
  }
  try{
    await startMicRecording(btnMic);
  } catch(e){
    alert(t('micNotSupported'));
  }
};

// ---- Voice tab (drawer, next to code/preview): the exact same live
// voice-to-voice technology/UI as Maha (OpenAI Realtime over WebRTC, same
// call screen, same animated orb), but in "builder" mode: no chat text is
// ever shown, results (image/app code) are dropped straight into the
// preview/code panels, and the assistant only gives a short spoken
// confirmation - available to every user (not owner-only). ----
const btnVoiceTabMic = $('#btnVoiceTabMic');
if(btnVoiceTabMic){
  btnVoiceTabMic.onclick = () => { mahaUnlockAudio(); mahaStartCall('builder'); };
}

// ---- Reusable small 🎤 buttons attached to any free-text field site-wide
// (video description, portrait/fashion/studio text fields, religious Q&A,
// car issue description, feedback box, etc). Each button records via
// MediaRecorder and transcribes via the same server-side /api/stt endpoint,
// then appends the transcript directly into its target field's value. ----
const miniMicStates = {};

async function miniMicStart(btn, targetId){
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let mimeType = '';
  for(const cand of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cand)){ mimeType = cand; break; }
  }
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => { if(e.data && e.data.size > 0) chunks.push(e.data); };
  recorder.start();
  miniMicStates[targetId] = { stream, recorder, chunks, mimeType };
  btn.classList.add('recording');
}

async function miniMicStop(btn, targetId){
  const st = miniMicStates[targetId];
  if(!st) return;
  const finished = new Promise((resolve) => { st.recorder.onstop = resolve; });
  st.recorder.stop();
  await finished;
  st.stream.getTracks().forEach(tr => tr.stop());
  btn.classList.remove('recording');
  btn.classList.add('transcribing');
  try{
    const blob = new Blob(st.chunks, { type: st.recorder.mimeType || st.mimeType || 'audio/webm' });
    delete miniMicStates[targetId];
    if(blob.size < 500){ btn.classList.remove('transcribing'); return; }
    const audioBase64 = await blobToBase64(blob);
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType: st.mimeType, lang, langHint: lang, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
    });
    const data = await res.json();
    btn.classList.remove('transcribing');
    if(!res.ok){
      alert(data && data.error ? data.error : t('micNotSupported'));
      return;
    }
    const transcript = (data && data.text ? data.text : '').trim();
    if(!transcript) return;
    const targetEl = document.getElementById(targetId);
    if(targetEl){
      targetEl.value = (targetEl.value ? targetEl.value + ' ' : '') + transcript;
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch(e){
    btn.classList.remove('transcribing');
    alert(t('micNotSupported'));
  }
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.mini-mic-btn');
  if(!btn) return;
  const targetId = btn.getAttribute('data-target');
  if(!targetId) return;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){
    alert(t('micNotSupported'));
    return;
  }
  if(btn.classList.contains('recording')){
    miniMicStop(btn, targetId);
  } else if(!btn.classList.contains('transcribing')){
    try{ await miniMicStart(btn, targetId); } catch(err){ alert(t('micNotSupported')); }
  }
});

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
