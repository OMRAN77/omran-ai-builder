window.postWithConfirm = postWithConfirm;
// ---- "Maha" (مها): full-screen, voice-only conversational assistant ----
// A dedicated hands-free "phone call" experience: no transcript/reply text is
// ever shown on screen, only a small status word + an animated orb. She
// listens, auto-detects silence to know when the user finished a sentence
// (no button needed for that), auto-detects the spoken language (any language
// in the world, not limited to the site's 5 UI languages) and always replies
// with a female voice in that same language, then automatically starts
// listening again until the user ends the call.
// Base prompt template: {{NAME}} and {{GENDER_DESC}} are filled in at call
// time based on the detected caller gender, so a male caller gets the
// "Abdullah" male persona/voice and a female caller gets the "Maha" female
// persona/voice - same personality and rules either way, just the name and
// gender framing change.
const MAHA_SYSTEM_PROMPT_TEMPLATE = "You are \"{{NAME}}\", a warm, witty, upbeat {{GENDER_DESC}} voice assistant having a live spoken phone call with the user - like a close, caring friend, never a formal robotic assistant. CRITICAL RULES: 1) Detect the language the user just spoke in (it can be ANY language in the world, not just Arabic or English) and ALWAYS reply in that exact same language. 2) If the user speaks Arabic, ALWAYS reply in natural, warm Khaleeji (Gulf) spoken dialect (never Modern Standard Arabic/Fus-ha) unless the user is clearly speaking a different Arabic dialect (e.g. Egyptian), in which case match their dialect naturally. 3) Never mix languages in a reply. 4) Keep replies VERY short and snappy, like a real quick back-and-forth phone chat: 1-2 short sentences, almost never more, unless the user explicitly asks for details or a list/recipe/steps. 5) Never use markdown, asterisks, headings, bullet points, emojis, or any symbols meant for reading on screen - your reply is spoken out loud only, plain natural speech. 6) You can chat about absolutely anything: news, general knowledge, advice, casual talk, jokes, banter. If unsure about very recent events, say so naturally and briefly. 7) Be lively and human: light humor, warmth, natural reactions - never stiff or overly formal. 8) STAY STRICTLY ON TOPIC: answer ONLY what the user actually asked about. Never drift into unrelated subjects like news, songs, sports, or recipes unless the user explicitly asked about that specific subject in their current or immediately preceding message. 9) For religious, factual, or sensitive topics (e.g. Quran, Islam, science, history), be extra precise and accurate, double-check your reasoning silently before answering, and if you are not fully certain, say so briefly instead of guessing or improvising. 10) Always use the full conversation history provided to understand context, but never let earlier topics leak into your answer to a new, different question. 11) NEVER think out loud and NEVER reveal your internal reasoning, uncertainty process, or self-questioning in your reply (e.g. never say things like 'does the user mean X or Y', 'is it possible that...', 'let me consider...'). If the transcript is unclear, garbled, or a word/name is ambiguous (e.g. a mis-heard city or place name), just ask ONE short, natural, casual clarifying question in the same language/dialect the user is speaking - nothing else, no meta-commentary. 12) Your entire reply must be 100% in a single language and a single dialect from start to finish, with absolutely zero words, phrases, or fragments from any other language mixed in, even mid-sentence.";

let mahaStream = null, mahaMediaRecorder = null, mahaChunks = [];
let mahaAudioCtx = null, mahaAnalyser = null, mahaVadRaf = null, mahaLastPeakRms = 0, mahaLowMicStreak = 0;
let mahaCallActive = false, mahaState = 'idle'; // idle | listening | thinking | speaking
let mahaHistory = [];
let mahaIntroduced = false;
let mahaCurrentAudio = null;
// A single reusable <audio> element that gets "unlocked" synchronously inside
// the user's click gesture, so later async .play() calls (after awaiting
// fetch/TTS) are not blocked by mobile/desktop autoplay policies.
const mahaAudioEl = new Audio();
mahaAudioEl.setAttribute('playsinline', '');
function mahaUnlockAudio(){
  try{
    mahaAudioEl.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu93pgQGZgAAAA//tQxAADwAABpAAAACAAADSAAAAE';
    const p = mahaAudioEl.play();
    if(p && p.catch) p.catch(()=>{});
  }catch(e){ __swallow(e, "misc:app-08-maha#1"); }
}

const btnMahaEl = document.getElementById('btnMaha');
const mahaCallScreenEl = document.getElementById('mahaCallScreen');
const mahaOrbEl = document.getElementById('mahaOrb');
const mahaWaveEl = document.getElementById('mahaWave');
const mahaStateLabelEl = document.getElementById('mahaStateLabel');
const btnMahaEndCallEl = document.getElementById('btnMahaEndCall');

/* ---------- مها floating draggable window ---------- */
(function mahaDraggableSetup(){
  const panel = mahaCallScreenEl;
  const handle = document.getElementById('mahaDragHandle');
  if(!panel || !handle) return;
  const POS_KEY = 'mahaCallWindowPos';

  function clampPos(x, y){
    const w = panel.offsetWidth || 260;
    const h = panel.offsetHeight || 340;
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(8, window.innerHeight - h - 8);
    return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) };
  }

  function applyPos(x, y){
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  const mahaCallScreenOriginalParent = panel.parentNode;
  window.mahaPositionOnOpen = function(){
    let x, y;
    const isBuilder = (typeof mahaCallMode !== 'undefined' && mahaCallMode === 'builder');
    if(isBuilder){
      const voicePanel = document.getElementById('panel-voice');
      if(voicePanel && panel.parentNode !== voicePanel) voicePanel.appendChild(panel);
      panel.style.position = 'static';
      panel.style.left = '';
      panel.style.top = '';
      panel.style.width = '100%';
      panel.style.height = '100%';
      panel.style.boxShadow = 'none';
      panel.style.background = 'transparent';
      panel.style.border = 'none';
      panel.style.borderRadius = '0';
      return;
    }
    if(panel.parentNode !== mahaCallScreenOriginalParent) mahaCallScreenOriginalParent.appendChild(panel);
    panel.style.position = 'fixed';
    panel.style.boxShadow = 'none';
    panel.style.background = 'none';
    panel.style.border = 'none';
    panel.style.borderRadius = '0';
    panel.style.width = 'auto';
    panel.style.height = 'auto';
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if(saved && typeof saved.x === 'number' && typeof saved.y === 'number'){
        x = saved.x; y = saved.y;
      }
    } catch(e){ __swallow(e, "ui:app-08-maha#2"); }
    if(x === undefined){
      x = Math.round((window.innerWidth - (panel.offsetWidth || 133)) / 2);
      y = Math.round((window.innerHeight - (panel.offsetHeight || 203)) / 2);
    }
    const c = clampPos(x, y);
    applyPos(c.x, c.y);
  };

  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function pointerDown(e){
    if(typeof mahaCallMode !== 'undefined' && mahaCallMode === 'builder') return;
    dragging = true;
    handle.style.cursor = 'grabbing';
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    e.preventDefault();
  }
  function pointerMove(e){
    if(!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    const c = clampPos(startLeft + dx, startTop + dy);
    applyPos(c.x, c.y);
  }
  function pointerUp(){
    if(!dragging) return;
    dragging = false;
    handle.style.cursor = 'grab';
    const rect = panel.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: rect.left, y: rect.top })); } catch(e){ __swallow(e, "save:app-08-maha#3"); }
  }

  handle.addEventListener('mousedown', pointerDown);
  window.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);
  handle.addEventListener('touchstart', pointerDown, { passive:false });
  window.addEventListener('touchmove', pointerMove, { passive:false });
  window.addEventListener('touchend', pointerUp);
  window.addEventListener('resize', () => {
    if(panel.style.display !== 'none' && panel.style.left){
      const rect = panel.getBoundingClientRect();
      const c = clampPos(rect.left, rect.top);
      applyPos(c.x, c.y);
    }
  });
})();

function mahaSetState(state, customLabel){
  mahaState = state;
  if(mahaOrbEl) mahaOrbEl.className = 'maha-orb-' + (state === 'error' ? 'thinking' : state);
  if(mahaWaveEl) mahaWaveEl.className = 'maha-wave-' + (state === 'error' ? 'thinking' : state);
  if(mahaStateLabelEl){
    const map = { idle: '', listening: t('mahaListening'), thinking: t('mahaThinking'), speaking: t('mahaSpeaking'), error: customLabel || t('mahaTryAgain') };
    mahaStateLabelEl.textContent = customLabel || map[state] || '';
  }
}

function mahaStopVad(){
  if(mahaVadRaf){ cancelAnimationFrame(mahaVadRaf); mahaVadRaf = null; }
  if(mahaAudioCtx){ try{ mahaAudioCtx.close(); }catch(e){ __swallow(e, "misc:app-08-maha#4"); } mahaAudioCtx = null; mahaAnalyser = null; }
}

function mahaStopStream(){
  if(mahaStream){ mahaStream.getTracks().forEach(tr => tr.stop()); mahaStream = null; }
}

// Simple, well-known autocorrelation pitch detector (ACF2+), operating on a
// Float32 time-domain buffer in the range [-1, 1]. Returns the estimated
// fundamental frequency in Hz, or -1 if the signal is too quiet/unclear.
function mahaAutoCorrelate(buf, sampleRate){
  const SIZE = buf.length;
  let rms = 0;
  for(let i = 0; i < SIZE; i++){ rms += buf[i] * buf[i]; }
  rms = Math.sqrt(rms / SIZE);
  if(rms < 0.01) return -1;
  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for(let i = 0; i < SIZE / 2; i++){ if(Math.abs(buf[i]) < thres){ r1 = i; break; } }
  for(let i = 1; i < SIZE / 2; i++){ if(Math.abs(buf[SIZE - i]) < thres){ r2 = SIZE - i; break; } }
  const trimmed = buf.slice(r1, r2);
  const newSize = trimmed.length;
  if(newSize < 8) return -1;
  const c = new Array(newSize).fill(0);
  for(let i = 0; i < newSize; i++){
    for(let j = 0; j < newSize - i; j++){ c[i] += trimmed[j] * trimmed[j + i]; }
  }
  let d = 0;
  while(d < newSize - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for(let i = d; i < newSize; i++){
    if(c[i] > maxval){ maxval = c[i]; maxpos = i; }
  }
  let T0 = maxpos;
  if(T0 > 0 && T0 < newSize - 1){
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
    if(a) T0 = T0 - b / (2 * a);
  }
  if(T0 <= 0) return -1;
  return sampleRate / T0;
}

// The assistant voice the user PICKED (first-run card or ⚙️ settings) — never a
// guess from the caller's own pitch. 'female' -> مها, 'male' -> عبدالله. Same
// persona, same dialect, same knowledge either way: only voice + name differ.
function mahaReadVoiceGender(){
  try{ return localStorage.getItem('aiapp_voice_gender') === 'male' ? 'male' : 'female'; }
  catch(e){ return 'female'; }
}
let mahaDetectedGender = mahaReadVoiceGender();
// Syncs the on-screen call card name with the chosen voice. The orb artwork is
// intentionally identical for both voices — only the name changes.
function mahaUpdatePersonaUI(){
  mahaDetectedGender = mahaReadVoiceGender();
  const male = mahaDetectedGender === 'male';
  const nameEl = document.getElementById('mahaCallNameLabel');
  if(nameEl) nameEl.textContent = male ? 'عبدالله' : 'مها';
  const orb = document.getElementById('mahaOrb');
  if(orb){
    orb.textContent = male ? '🧔' : '💁‍♀️';
    orb.style.background = male ? 'linear-gradient(135deg,#ffd77a,#b8860b)' : 'linear-gradient(135deg,#ff5fa2,#7b5cff)';
    orb.style.boxShadow = male ? '0 0 35px rgba(184,134,11,.6)' : '0 0 28px rgba(123,92,255,.5)';
    orb.style.border = 'none';
    orb.style.fontSize = '39px';
  }
}
// First-run voice picker: shown once, before the very first call, then stored.
// Changeable any time from ⚙️ الإعدادات › الصوت.
function mahaEnsureVoiceChosen(){
  return new Promise(resolve => {
    let already = null;
    try{ already = localStorage.getItem('aiapp_voice_gender'); }catch(e){ /* guard-ok: unavailable storage shows the safe first-run picker. */ }
    if(already === 'male' || already === 'female') return resolve(already);
    const wrap = document.createElement('div');
    wrap.id = 'voicePickFirstRun';
    wrap.style.cssText = 'position:fixed; inset:0; z-index:100000; display:flex; align-items:center; justify-content:center; background:rgba(8,7,14,.82); backdrop-filter:blur(6px);';
    const card = document.createElement('div');
    card.dir = 'rtl';
    card.style.cssText = 'width:min(92vw,420px); background:#12101c; border:1px solid rgba(255,255,255,.10); border-radius:22px; padding:26px 22px; text-align:center; box-shadow:0 24px 60px rgba(0,0,0,.55);';
    const opt = (g, name) => '<button type="button" data-g="' + g + '" class="vpFirstBtn" style="flex:1; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:18px; padding:18px 10px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:12px;">'
      + '<span style="width:74px; height:74px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:36px; background:' + (g === 'male' ? 'linear-gradient(135deg,#ffd77a,#b8860b)' : 'linear-gradient(135deg,#ff5fa2,#7b5cff)') + '; box-shadow:' + (g === 'male' ? '0 0 50px rgba(184,134,11,.6)' : '0 0 40px rgba(123,92,255,.5)') + ';">'
      + (g === 'male' ? '🧔' : '💁‍♀️')
      + '</span><span style="color:#fff; font-size:17px; font-weight:700;">' + name + '</span></button>';
    card.innerHTML = '<div style="color:#fff; font-size:19px; font-weight:700; margin-bottom:6px;">اختر صوت المساعد</div>'
      + '<div style="color:#a9a2bd; font-size:13px; margin-bottom:20px;">تقدر تغيّره لاحقًا من الإعدادات</div>'
      + '<div style="display:flex; gap:12px;">' + opt('female','مها') + opt('male','عبدالله') + '</div>';
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    card.querySelectorAll('.vpFirstBtn').forEach(b => {
      b.onclick = () => {
        const g = b.getAttribute('data-g');
        try{ localStorage.setItem('aiapp_voice_gender', g); }catch(e){ /* guard-ok: voice selection still applies for this session. */ }
        if(typeof setVoiceGenderUI === 'function'){ try{ setVoiceGenderUI(g); }catch(e){ /* guard-ok: optional settings mirror must not block the call. */ } }
        wrap.remove();
        resolve(g);
      };
    });
  });
}
// All pitch samples collected across the *entire* call (not reset per turn).
// A single noisy turn (background sound, echo, weak mic) can produce a wrong
// per-turn reading, so we accumulate evidence over the whole conversation and
// classify from the combined history - this makes the detected gender stable
// and consistent for the rest of the call once enough samples are in.
let mahaAllPitchSamples = [];

let mahaInterruptStream = null, mahaInterruptCtx = null, mahaInterruptRaf = null;

// Listens on the mic *while Maha is talking* so the user can interrupt her by
// just speaking (barge-in), instead of having to wait for her to finish.
// Fails silently if mic access isn't available for any reason.
async function mahaStartInterruptListener(audio, onInterrupt){
  try{
    mahaInterruptStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  }catch(e){ return; }
  if(audio.paused || audio.ended){ mahaStopInterruptListener(); return; } // already done by the time mic opened
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  mahaInterruptCtx = new AudioCtx();
  const source = mahaInterruptCtx.createMediaStreamSource(mahaInterruptStream);
  const analyser = mahaInterruptCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const dataArr = new Uint8Array(analyser.fftSize);
  const freqArr = new Uint8Array(analyser.frequencyBinCount);
  const sampleRate = mahaInterruptCtx.sampleRate || 44100;
  const binHz = sampleRate / analyser.fftSize;
  // Human voice energy is concentrated roughly 200Hz-3500Hz. Random movement /
  // bumps / mic handling noise is mostly low-frequency rumble or a broadband
  // impulsive click, so we require the loud sound to also look "voice-shaped"
  // (most of its energy inside the speech band) before treating it as speech.
  const speechBinLo = Math.max(1, Math.round(200 / binHz));
  const speechBinHi = Math.min(freqArr.length - 1, Math.round(3500 / binHz));
  const INTERRUPT_THRESHOLD = 0.07; // higher than the listening threshold so speaker bleed-through doesn't self-trigger
  const SPEECH_BAND_RATIO_MIN = 0.55; // fraction of total spectral energy that must sit in the speech band
  const LOUD_FRAMES_NEEDED = 8; // ~8 consecutive voice-shaped frames (~250-300ms) avoids false triggers from taps/movement
  let loudStreak = 0;
  const tick = () => {
    if(!mahaInterruptCtx || audio.paused || audio.ended) return;
    analyser.getByteTimeDomainData(dataArr);
    let sumSq = 0;
    for(let i = 0; i < dataArr.length; i++){ const v = (dataArr[i] - 128) / 128; sumSq += v * v; }
    const rms = Math.sqrt(sumSq / dataArr.length);
    let isVoiceShaped = false;
    if(rms > INTERRUPT_THRESHOLD){
      analyser.getByteFrequencyData(freqArr);
      let total = 0, band = 0;
      for(let i = 1; i < freqArr.length; i++){
        total += freqArr[i];
        if(i >= speechBinLo && i <= speechBinHi) band += freqArr[i];
      }
      isVoiceShaped = total > 0 && (band / total) >= SPEECH_BAND_RATIO_MIN;
    }
    loudStreak = isVoiceShaped ? loudStreak + 1 : 0;
    if(loudStreak >= LOUD_FRAMES_NEEDED){
      try{ audio.pause(); }catch(e){ __swallow(e, "misc:app-08-maha#5"); }
      onInterrupt();
      return;
    }
    mahaInterruptRaf = requestAnimationFrame(tick);
  };
  mahaInterruptRaf = requestAnimationFrame(tick);
}

function mahaStopInterruptListener(){
  if(mahaInterruptRaf){ cancelAnimationFrame(mahaInterruptRaf); mahaInterruptRaf = null; }
  if(mahaInterruptCtx){ try{ mahaInterruptCtx.close(); }catch(e){ __swallow(e, "misc:app-08-maha#6"); } mahaInterruptCtx = null; }
  if(mahaInterruptStream){ mahaInterruptStream.getTracks().forEach(tr => tr.stop()); mahaInterruptStream = null; }
}

// Language Maha should speak her reply in, refreshed each turn from Whisper's
// own detection of what the caller actually spoke. Defaults to the site's
// current UI language until we have a real detection.
let mahaReplyLang = (typeof lang !== 'undefined' ? lang : 'ar');

async function mahaSpeak(text){
  return new Promise(async (resolve) => {
    try{
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: 'maha', text: String(text).slice(0, 4000), gender: mahaDetectedGender, lang: mahaReplyLang })
      });
      if(!resp.ok){ resolve(); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = mahaAudioEl;
      mahaCurrentAudio = audio;
      let settled = false;
      const finish = () => {
        if(settled) return;
        settled = true;
        mahaStopInterruptListener();
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.src = url;
      await audio.play();
      mahaStartInterruptListener(audio, finish);
    }catch(e){ resolve(); }
  });
}

// Records the mic and uses volume-based silence detection to know when the
// user finished talking (hands-free - no button press needed per turn).
async function mahaRecordUntilSilence(){
  mahaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let mimeType = '';
  for(const cand of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cand)){ mimeType = cand; break; }
  }
  mahaMediaRecorder = mimeType ? new MediaRecorder(mahaStream, { mimeType }) : new MediaRecorder(mahaStream);
  mahaChunks = [];
  mahaMediaRecorder.ondataavailable = (e) => { if(e.data && e.data.size > 0) mahaChunks.push(e.data); };

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  mahaAudioCtx = new AudioCtx();
  const source = mahaAudioCtx.createMediaStreamSource(mahaStream);
  mahaAnalyser = mahaAudioCtx.createAnalyser();
  mahaAnalyser.fftSize = 2048;
  source.connect(mahaAnalyser);
  const dataArr = new Uint8Array(mahaAnalyser.fftSize);

  const finished = new Promise((resolve) => { mahaMediaRecorder.onstop = resolve; });
  mahaMediaRecorder.start(); // single chunk on stop, same reliable pattern as the manual mic button

  const startTime = Date.now();
  const SILENCE_THRESHOLD = 0.022; // RMS amplitude below this = silence (raised so ambient/background noise isn't mistaken for speech)
  const SILENCE_HOLD_MS = 900;     // how long silence must last to end the turn (raised from 550ms - 550ms was cutting people off mid-sentence during natural pauses, causing garbled/incomplete transcripts)
  const MIN_TALK_MS = 1000;        // ignore silence before user has said anything (real speech needs to sustain longer than noise blips)
  const MAX_TURN_MS = 20000;       // hard safety cap per turn
  let lastLoudAt = Date.now();
  let everLoud = false;
  let peakRms = 0;
  const floatBuf = new Float32Array(mahaAnalyser.fftSize);
  const pitchSamples = [];
  let pitchTickCounter = 0;

  await new Promise((resolve) => {
    const tick = () => {
      if(!mahaCallActive || mahaMediaRecorder.state !== 'recording'){ resolve(); return; }
      mahaAnalyser.getByteTimeDomainData(dataArr);
      let sumSq = 0;
      for(let i = 0; i < dataArr.length; i++){ const v = (dataArr[i] - 128) / 128; sumSq += v * v; }
      const rms = Math.sqrt(sumSq / dataArr.length);
      if(rms > peakRms) peakRms = rms;
      // Live visual feedback so the user can see the mic is actually picking up sound.
      if(mahaOrbEl){
        const scale = 1 + Math.min(rms * 6, 0.35);
        mahaOrbEl.style.transform = 'scale(' + scale.toFixed(3) + ')';
      }
      const now = Date.now();
      if(rms > SILENCE_THRESHOLD){
        lastLoudAt = now; everLoud = true;
        // Sample the fundamental pitch every few frames while the user is
        // actually talking, to later guess whether they sound male or female.
        pitchTickCounter++;
        if(pitchTickCounter % 4 === 0){
          mahaAnalyser.getFloatTimeDomainData(floatBuf);
          const freq = mahaAutoCorrelate(floatBuf, mahaAudioCtx.sampleRate);
          if(freq > 70 && freq < 400) pitchSamples.push(freq);
        }
      }
      const elapsed = now - startTime;
      const silentFor = now - lastLoudAt;
      if(elapsed > MAX_TURN_MS || (everLoud && elapsed > MIN_TALK_MS && silentFor > SILENCE_HOLD_MS)){
        resolve();
        return;
      }
      mahaVadRaf = requestAnimationFrame(tick);
    };
    mahaVadRaf = requestAnimationFrame(tick);
  });
  if(mahaOrbEl) mahaOrbEl.style.transform = '';
  mahaLastPeakRms = peakRms;

  // Estimate the caller's gender from the median pitch across the WHOLE call
  // so far (not just this turn). Typical adult male fundamental frequency is
  // roughly 85-165Hz, adult female roughly 165-255Hz, so ~165Hz is a
  // reasonable split point. Combining every turn's samples smooths out any
  // single noisy/echoey turn that would otherwise flip the voice mid-call.
  if(pitchSamples.length >= 5){
    // Drop this turn's own outliers first (keep the middle 70%) so one bad
    // moment within the turn doesn't skew the pooled history either.
    const turnSorted = pitchSamples.slice().sort((a, b) => a - b);
    const lo = Math.floor(turnSorted.length * 0.15);
    const hi = Math.ceil(turnSorted.length * 0.85);
    const trimmed = turnSorted.slice(lo, hi).length ? turnSorted.slice(lo, hi) : turnSorted;
    mahaAllPitchSamples.push(...trimmed);
    // Cap history so very long calls don't grow unbounded.
    if(mahaAllPitchSamples.length > 400) mahaAllPitchSamples = mahaAllPitchSamples.slice(-400);
    // Only start classifying once we have a solid pool of samples; before
    // that, keep the default so we don't flip on a single early turn.
    if(mahaAllPitchSamples.length >= 12){
      const sorted = mahaAllPitchSamples.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      void median; // v493: pitch no longer picks the voice — the user does.
    }
  }

  mahaStopVad();
  if(mahaMediaRecorder.state === 'recording') mahaMediaRecorder.stop();
  await finished;
  mahaStopStream();

  const blob = new Blob(mahaChunks, { type: mahaMediaRecorder.mimeType || mimeType || 'audio/webm' });
  return blob;
}

// Heuristic: does this turn need live/real-time info from the internet
// (weather, news, sports scores/results, prices, "today/now/currently" facts)?
// Keeps Maha fast by only searching when it's actually likely to help.
const MAHA_SEARCH_KEYWORDS = [
  // Arabic (MSA + Gulf dialect)
  'طقس','جو','درجة الحرارة','مطر','أمطار','امطار','الامطار','الأمطار','توقعات','توقع','ابحث','أبحث','بحث لي','مصدر','مصادر','المصدر','اخبار','أخبار','خبر','نتيجة','نتائج','مباراة','مباريات',
  'الدوري','كأس','بطولة','سعر','أسعار','اسعار','سهم','اسهم','بورصة','عملة','دولار','ذهب','نفط',
  'اشتراك','اشتراكات','الاشتراك','تكلفة','كلفة','التكلفة','بكم','كم يكلف','كم تكلف','رسوم','باقة','باقات',
  'اليوم','الحين','الآن','حاليا','حالياً','آخر','احدث','أحدث','جديد','مين فاز','من فاز','نتيجة المباراة',
  'وفاة','توفي','توفى','مات','ميت','متوفي','متوفى','رحيل','فارق الحياة','حي او ميت','حي أو ميت',
  'انتخابات','رئيس','ملك','امير','أمير','حرب','زلزال','كارثة','حادث','اعلان','إعلان','قرار',
  'سيارات','سيرات','سياير','ايجار','إيجار','اجار','تأجير','تاجير','استئجار',
  'تذكرة','تذاكر','تذكره','طيران','رحلة','رحله','رحلات','حجز','فندق','فنادق','وظيفة','وظائف','وظيفه','شقة','شقه','شقق','فيلا','فلل',
  'flight','ticket','tickets','hotel','booking','rent','apartment','villa','job','jobs',
  // English
  'weather','forecast','temperature','rain','news','score','result','match','game','league',
  'championship','price','stock','currency','exchange rate','gold price','oil price',
  'subscription','cost','pricing','how much','plan price','fee','fees',
  'today','now','currently','latest','recent','who won','breaking',
  'died','death','dead','passed away','alive','election','president','king','emir','war','earthquake',
];

function mahaNeedsSearch(text){
  if(!text) return false;
  const lower = text.toLowerCase();
  return MAHA_SEARCH_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

// If the user's turn looks like it needs real-time info, hit our Tavily-backed
// /api/search endpoint and turn the results into a system message Maha can use.
// Fails silently (returns null) on any error/timeout so a call never gets stuck.
async function mahaMaybeSearch(transcript){
  if(!mahaNeedsSearch(transcript)) return null;
  return await fetchSearchNote(transcript);
}

// 🧭 موزّع البحث الذكي (المحادثة الرئيسية): يقرر بالمعنى - مثل ChatGPT -
// إذا كان السؤال يحتاج بحث إنترنت حقيقي (أشخاص، شركات، حسابات تواصل،
// أرقام، إعلانات بيع، أسعار، أخبار...) بدل الاعتماد على كلمات مفتاحية فقط.
// قاعدة عمران: أي سؤال فيه "عمران/Omran" ممنوع البحث نهائيًا - يجاوب من
// هويته الداخلية (منع خلط التطبيق مع تطبيقات أخرى بنفس الاسم).
// 👋 كاشف التحية: رسالة قصيرة كلها تحية/مجاملة => لا بحث ولا مصادر ولا مواضيع قديمة.
// 📄 v314: تحويل نص رد إلى صفحة PDF مرتبة عبر نافذة الطباعة (يشتغل على كل الأجهزة بدون مزود)
function exportTextAsPdf(raw){
  try{
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let txt = String(raw).replace(/```[\s\S]*?```/g, '').trim();
    const lines = txt.split('\n');
    let html = '', inList = false;
    for(let ln of lines){
      let l = esc(ln.trim());
      l = l.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
      if(!l){ if(inList){ html += '</ul>'; inList = false; } continue; }
      if(/^#{1,4}\s/.test(l)){ if(inList){ html += '</ul>'; inList = false; } html += '<h2>' + l.replace(/^#{1,4}\s*/, '') + '</h2>'; }
      else if(/^[-•*]\s/.test(l)){ if(!inList){ html += '<ul>'; inList = true; } html += '<li>' + l.replace(/^[-•*]\s*/, '') + '</li>'; }
      else { if(inList){ html += '</ul>'; inList = false; } html += '<p>' + l + '</p>'; }
    }
    if(inList) html += '</ul>';
    const isAr = /[\u0600-\u06FF]/.test(txt);
    const font = msgPdfFontSpec();
    const pdfFont = msgPdfFontHead(font);
    const doc = '<!DOCTYPE html><html dir="' + (isAr ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><title>Omran AI Builder</title>' + pdfFont.link + '<style>body{font-family:' + pdfFont.family + ';color:#111;background:#fff;padding:28px 32px;line-height:' + font.line + ';font-size:14.5px}h2{font-size:17px;margin:18px 0 6px;color:#4c2a92;border-bottom:1px solid #eee;padding-bottom:4px}ul{margin:4px 0;padding-' + (isAr ? 'right' : 'left') + ':22px}p{margin:6px 0}footer{margin-top:30px;font-size:11px;color:#999;text-align:center}</style></head><body>' + html + '<footer>Omran AI Builder</footer></body></html>';
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(fr);
    fr.srcdoc = doc;
    fr.onload = function(){
      msgPrintAfterFont(fr.contentWindow, pdfFont.family, 'ui:app-08-maha#7');
      setTimeout(function(){ try{ fr.remove(); }catch(e){ __swallow(e, "ui:app-08-maha#8"); } }, 60000);
    };
  }catch(e){ __swallow(e, "ui:app-08-maha#9"); }
}
function isPureGreeting(t){
  if(!t) return false;
  const s = String(t).trim();
  if(s.length > 60) return false;
  // v313: «نعم/تمام/يلا/اوك...» = تأكيد لإكمال الموضوع — ليست تحية أبدًا.
  if(/^(نعم|ايه|إيه|اي|أي|يب|اوك|أوك|اوكي|تمام|طيب|زين|يلا|ابدا|ابدأ|كمل|أكمل|واصل|صح|اكيد|أكيد|ماشي|موافق|سوها|سويها|نفذ|نفّذ|yes|ok|okay|yep|sure|go|continue)[\s،,.!؟?~\-_()]*$/i.test(s)) return false;
  // التحية اللفظية فقط. سؤال المجاملة («كيف الحال؟») محادثة، لا تحية محفوظة.
  const greetRe = /السلام عليكم(\s*ورحمة الله(\s*وبركاته)?)?|وعليكم السلام|صباح الخير|صباح النور|مساء الخير|مساء النور|مرحبا|مرحبًا|مرحبتين|هلا|أهلا|أهلًا|اهلين|أهلين|يا هلا|حياك|تحية طيبة|سلام|good morning|good evening|good afternoon|hello|hey|hi|salam|marhaba/gi;
  if(!greetRe.test(s)) return false; // لازم تحتوي كلمة ترحيب فعلية
  greetRe.lastIndex = 0;
  const stripped = s.replace(greetRe, '').replace(/[\s،,.!؟?~\-_()🌹🌸😊🙏❤️💜👋🤍✨]+/g, '');
  return stripped.length <= 3;
}
function isCasualCheckIn(t){
  if(!t) return false;
  const s = String(t).trim();
  if(s.length > 80) return false;
  return /^(?:(?:هلا|مرحبا|مرحبًا|أهلا|أهلًا|السلام عليكم|سلام|hello|hi|hey)[\s،,.!؟?~\-]*)?(?:كيف حالك|كيف الحال|شحالك|شخبارك|شو الأخبار|كيفك|how are you|how(?:'|’)s it going|how is it going)[\s،,.!؟?~\-]*$/i.test(s);
}
// v628 عيب [ب]: شريط الصور كان يُطلب في كلّ بحث حيّ (images: true دائمًا)، فظهرت صور
// طائرات حديثة تحت سؤال تاريخيّ. الآن نيّة صور صريحة في نصّ المستخدم فقط.
// (ال/بال/وال) مسموحة قبل «صور»؛ أيّ حرف عربيّ آخر قبلها يمنع المطابقة، فلا تمسك «قصور» و«عصور» و«تصوير».
const __IMG_ASK_RE = /(?:^|[^\u0621-\u064A])(?:ال|لل|بال|وال|فال|كال)?(?:صور|صوره|صورة|لقطات|بوستر)/;
const __IMG_SHAPE_RE = /شكلها|شكله|شكلهم|كيف تبدو|كيف يبدو|كيف كان شكل|وش شكل|شو شكل|شنو شكل/;
const __IMG_EN_RE = /\b(photos?|pictures?|images?|pics|thumbnails?)\b|\blooks? like\b/i;
// توليد/تعديل صورة أو الإشارة إلى صورة مرفقة = ليس شريط بحث.
const __IMG_MAKE_RE = /^\s*صور[هة]\s+\S|صوّر لي|صور لي|صوره لي|صورة لي|صورلي|صوّرلي|تصور لي|ارسم|أرسم|ارسمي|صمم|صمّم|اصمم|اصنع|اعمل لي|سوي لي|سوّي لي|ولّد|ولد لي|حوّل|عدّل|اقتطع|ازل الخلفية|أزل الخلفية|generate|create an image|draw|design|edit it|remove background|هذه الصورة|هالصورة|الصورة المرفقة|في الصورة|بالصورة|(?:عطني|أعطني|اعطني|هات|ابا|أبا|ابي|أبي|ابغي|أبغي|ابغى|أبغى|اريد|أريد|سو|سوي|سوّي|اعمل|أعمل|give me|make me|i want)\s+(?:لي\s+)?[^\n]{0,20}?(?:تصميم|تصور|صور[هة]|رسم[هة]|design|image|picture)/i; // v656 (مضيّق: «صور» الجمع تبقى بحثًا عن صور حقيقية): «أريد صورة…» = توليد بالذكاء الاصطناعي، لا شريط صور جوجل
// يلتقط سؤال الوصفة لتوجيه البحث النصّي فقط، لا لطلب شريط صور تلقائي.
// الصور لا تُجلب إلا عند طلبها بكلمات صريحة.
const __RECIPE_IMG_RE = /(?:^|[\s،,])(?:ط(?:ريق|رق)[هة](?:\s+(?:طبخ|تحضير|عمل|صنع|الطبخ|التحضير))?|وصف[هة](?=[\s،]|$)|مكونات(?=[\s،]|$)|تحضير(?=\s)|المقادير(?=[\s،]|$)|[أا]طبخ\s|[أا]عمل\s(?!لي)|[أا]صنع\s|سوّ?[يى]\s)|(?:كيف\s+[أا]?(?:طبخ|عمل|صنع|حضّر|حضر|سوّ?[يى]|أعمل|اعمل|أطبخ|اطبخ))\s|(?:طبخة|أكلة|وجبة)\s+\S|(?:how to\s+(?:cook|make|prepare|bake))\s|(?:recipe\s+(?:for|of))\s/i;
const __RECIPE_STRIP_RE2 = /(?:ط(?:ريق|رق)[هة](?:\s+(?:طبخ|تحضير|عمل|صنع|الطبخ|التحضير|العمل|الصنع))?|وصف[هة]|مكونات|المقادير|كيف\s+[أا]?(?:طبخ|عمل|صنع|حضّر|حضر|سوّ?[يى]|أعمل|اعمل|أطبخ|اطبخ)|تحضير|[أا]طبخ|[أا]عمل|[أا]صنع|طبخة|أكلة|وجبة|how to\s+(?:cook|make|prepare|bake)|recipe\s*(?:for|of)?|ingredients?\s*(?:for|of)?)/gi;
// v628 عيب [د] (قياس حيّ): «هل يوجد صور لها» يجرف Tavily وGoogle إلى مواقع صور المخزون
// (unsplash · shutterstock) وصورًا بلا علاقة. نبحث بالموضوع وحده ونُخرج ألفاظ الطلب من الاستعلام.
const __IMG_STRIP_RE = /(?:^|[^\u0621-\u064A])(?:ال|لل|بال|وال|فال|كال)?(?:صور|صوره|صورة|لقطات|بوستر)[\u0621-\u064A]*/g;
const __IMG_REQ_WORDS_RE = /(?:^|\s)(?:هل|يوجد|توجد|فيه|في|أعطني|اعطني|عطني|وريني|أرني|ارني|ابغى|أبغى|ابي|أبي|أريد|اريد|ممكن|لها|له|لهم|لهذا|لهذه|من فضلك|please|show|me|photos?|pictures?|images?|pics|thumbnails?|are|is|there|do|you|have|of|for|it)(?=\s|$)/gi;
function __imgTopicQuery(q){
  const t = String(q || '').replace(__IMG_STRIP_RE, ' ').replace(__IMG_REQ_WORDS_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  return t.length >= 3 ? t.slice(0, 160) : '';
}
// v529: يستخرج اسم الطبق من استعلام الوصفة (يحذف كلمات الطبخ، يبقي اسم الأكلة)
function __recipeTopicQuery(q){
  const t = String(q || '').replace(__RECIPE_STRIP_RE2, ' ').replace(/\s{2,}/g, ' ').trim();
  if(t.length < 2) return String(q || '').slice(0, 100); // fallback
  // عربي: نضيف «طبخ وصفة» أمام اسم الطبق ← نتائج مواقع طبخ عربية لا قواميس إنجليزية
  // إنجليزي: نضيف «recipe» بعده
  // اسم الطبق + وصفة + recipe ← يجيب خليط عربي وإنجليزي بدل إنجليزي فقط
  if(/[\u0600-\u06FF]/.test(t)) return (t + ' وصفة recipe').slice(0, 130);
  return (t + ' recipe').slice(0, 130);
}
function __wantsImageStrip(t){
  const s = String(t || '');
  if(!s || __IMG_MAKE_RE.test(s)) return false;
  return __IMG_ASK_RE.test(s) || __IMG_SHAPE_RE.test(s) || __IMG_EN_RE.test(s);
}
async function smartMaybeSearch(text, ctxMsgs){
  if(!text) return null;
  if(isPureGreeting(text) || isCasualCheckIn(text)) return null;
  if(/عمران|omran/i.test(text)) return null;
  // v327: طلب لوجو/شعار/تصميم شخصي (لتطبيقي/شركتي/لي...) = مهمة تصميم — ممنوع البحث الحي نهائيًا.
  if(/(لوجو|شعار|\blogo\b|تصميم|صمم|صمّم)/i.test(text) && /(لي|إلي|الي|لتطبيق|تطبيقي|لموقع|موقعي|لشرك|شركتي|لمشروع|مشروعي|لمتجر|متجري|لقناة|قناتي|خاص|my|for me)/i.test(text)) return null;

  // v556: خريطة مجالات — تمنع حقن سياق من مجال مختلف (عيب: «اريد عقارات» بعد حديث اللوحات).
  const __DOMS = [[/لوح(ة|ات|تين)|رقم\s*مميز|[\u0623\u0627]رقام\s*مميزة|بليت|بلايت|plate/i,'num'],[/عقار|شق(ة|ق|تين)|فيلا|فلل|[\u0623\u0627]رض|اراضي|\u0623راضي|apartment|villa|property/i,'re'],[/سيار|سيرات|سياير|مركب|\bcars?\b/i,'car'],[/وظيف|وظائف|توظيف|شغل|\bjobs?\b|vacanc/i,'job'],[/فندق|فنادق|منتجع|شاليه|hotel|resort/i,'htl'],[/طيران|تذكرة|تذاكر|flight|airfare/i,'fly'],[/مطعم|مطاعم|كافيه|منيو|كتالوج/i,'food']];
  const __domOf = s => { for(const d of __DOMS){ if(d[0].test(s)) return d[1]; } return ''; };
  // v384: 🧠 بحث واعي بالسياق — إذا الرسالة قصيرة وتبدو متابعة (عطني الروابط / المزيد / تفاصيل...)
  // نجيب الموضوع الأصلي من آخر رسائل المحادثة ونضيفه للاستعلام.
  let searchQuery = text;
  const __followUpRe = /^(عطني|أعطني|اعطني|هات|وريني|أرني|ابغي|أبي|ابي|أريد|اريد|ممكن|المزيد|تفاصيل|أكثر|زيادة|كمل|أكمل|واصل|وش صار|شو عن|ايش عن|الروابط|المواقع|اللنكات|الخيارات|البدائل|give me|show me|more|details|links|what about|alternatives)/i;
  if(ctxMsgs && text.length < 60 && __followUpRe.test(text)){
    // خذ آخر رسالة مستخدم سابقة (اللي فيها الموضوع الأصلي)
    const __prevUser = ctxMsgs.filter(m => m.role === 'user' && m.content && String(m.content).trim() !== text.trim() && String(m.content).length > 5);
    // v467b: وآخر رد AI — نأخذ أول 300 حرف لأنه يحتوي الموضوع الفعلي (أسماء دول/أماكن/شركات)
    const __prevAI = ctxMsgs.filter(m => m.role !== 'user' && m.content && String(m.content).length > 20);
    let __topic = '';
    if(__prevUser.length) __topic = String(__prevUser[__prevUser.length - 1].content).slice(0, 200);
    // v467b: ندمج سياق رد الـAI مع رسالة المستخدم — هذا يحل مشكلة "اسأل عن السعودية يبحث بالإمارات"
    if(__prevAI.length){
      const __aiSnippet = String(__prevAI[__prevAI.length - 1].content).slice(0, 300);
      __topic = __topic ? (__topic + ' ' + __aiSnippet) : __aiSnippet;
    }
    if(__topic){
      // v556: مجال جديد صريح يختلف عن مجال السياق => سؤال مستقل، صفر حقن.
      const __dNew = __domOf(text), __dCtx = __domOf(__topic);
      // v618: «اريد/عطني/ممكن» بداية طبيعية لسؤال جديد كامل، لا متابعة. المتابعة الحقيقيّة إمّا
      // بلا موضوع خاص بها («المزيد» · «كمل» · «عطني الروابط») أو فيها إشارة مرجعيّة («عن هذا»).
      const __refRe = /(هذا|هذه|هذي|هالشي|هالموضوع|ذاك|ذلك|تلك|عنه|عنها|عنهم|نفسه|نفسها|السابق|السابقة|المذكور|اللي فوق|اللي قلت|اللي ذكرت|\bthis\b|\bthat\b|\bthose\b|\bthem\b|\bit\b|above)/i;
      const __stopRe = /^(عطني|أعطني|اعطني|هات|هاتلي|وريني|أرني|ارني|ابغي|أبغي|أبي|ابي|أريد|اريد|بغيت|ودي|ممكن|لو سمحت|من|عن|في|على|إلى|الى|لي|ل|ب|المزيد|مزيد|زيادة|أكثر|اكثر|كمل|أكمل|اكمل|واصل|كامل|تفاصيل|التفاصيل|معلومات|المعلومات|معلومة|شرح|اشرح|إشرح|وضح|وضّح|قول|قل|زودني|الروابط|روابط|رابط|المواقع|مواقع|موقع|اللنكات|لنكات|لينكات|الخيارات|خيارات|البدائل|بدائل|وش|شو|ايش|إيش|صار|و|أو|او|ال|كل|شي|شيء|الحين|الآن|بعد|now|give|me|show|more|details|detail|info|information|links|link|sites|site|about|the|a|an|of|for|please|plz|pls|and|or|some)$/i;
      const __content = text.replace(/[^\u0600-\u06FF\u0750-\u077FA-Za-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !__stopRe.test(w));
      const __pureFollow = __content.length === 0 || __refRe.test(text);
      // حقن السياق: متابعة بحتة · إشارة صريحة · أو نفس المجال. غير ذلك = سؤال مستقل، صفر حقن.
      const __inject = __pureFollow || (__dNew && __dCtx && __dNew === __dCtx);
      searchQuery = __inject ? (__topic + ' ' + text).slice(0, 500) : text;
    }
  }

  // v628 عيب [ج]: سؤال قصير يبدأ باستفهام ويشير إلى موضوع الردّ السابق («كم عدد الأشخاص التي نقلتهم
  // الطائرة») لا يمسكه __followUpRe، فيُبحث بلا سياق وتأتي مصادر عن موضوع آخر. الشرط: استفهام +
  // اشتراك لفظيّ حقيقيّ مع آخر ردّ + بلا مجال مختلف. الحقن = أوّل جملة من الردّ السابق فقط.
  if(ctxMsgs && searchQuery === text && text.length < 90 && /^(?:و?(?:ايش|إيش|وش|شو|شنو)|كم|متى|وين|أين|ليش|لماذا|كيف|هل|من هو|من هي|من صنع|ما هو|ما هي|who|what|when|where|why|how)/i.test(text.trim())){
    const __ai2 = ctxMsgs.filter(m => m.role !== 'user' && m.content && String(m.content).length > 20);
    const __last2 = __ai2.length ? String(__ai2[__ai2.length - 1].content) : '';
    if(__last2){
      const __norm2 = w => w.replace(/[\u0623\u0625\u0622]/g, '\u0627').replace(/\u0649/g, '\u064a').replace(/\u0629/g, '\u0647').replace(/^(?:و|ف)?(?:ب|ل|ك)?(?:ال)?/, '');
      const __toks2 = str => (String(str).match(/[\u0621-\u064A]{4,}|[A-Za-z]{4,}/g) || []).map(w => __norm2(w.toLowerCase()));
      const __ctx2 = __toks2(__last2);
      const __shared2 = __toks2(text).filter(w => w.length >= 4 && __ctx2.some(c => c.startsWith(w) || w.startsWith(c)));
      const __dn2 = __domOf(text), __dc2 = __domOf(__last2);
      if(__shared2.length && !(__dn2 && __dc2 && __dn2 !== __dc2)){
        const __sent2 = (__last2.split(/\n|\.\s|\u061F|!/)[0] || '').slice(0, 180).trim();
        if(__sent2) searchQuery = (__sent2 + ' ' + text).slice(0, 400);
      }
    }
  }

  // v384: 🔬 Deep Research — استعلامات معقدة أو صريحة تحتاج بحث عميق بعدة زوايا.
  const __deepRe = /بحث عميق|بحث شامل|تقرير مفصل|تحليل شامل|قارن بين|مقارنة.*بين|أفضل\s*(خيارات|بدائل|مواقع|شركات|تطبيقات)|deep research|comprehensive|detailed report|compare.*between/i;
  const __wantDeep = __deepRe.test(text) || (text.length > 120 && mahaNeedsSearch(text));

  // v628 عيب [ب]: نيّة صور صريحة = بحث حيّ إجباري (سؤال «هل يوجد صور» كان يمرّ بلا بحث فلا صور).
  if(__wantsImageStrip(text)){
    // v529: وصفة/طبخ → نستخرج اسم الطبق فقط كاستعلام صورة (بدل الجملة كلّها)
    let __iq = __RECIPE_IMG_RE.test(text) ? __recipeTopicQuery(searchQuery) : __imgTopicQuery(searchQuery);
    // «هل يوجد صور لها» بلا موضوع خاصّ بها = طلب مرجعيّ بحت: الموضوع من أوّل جملة في الردّ السابق.
    if(!__iq && ctxMsgs){
      const __ai3 = ctxMsgs.filter(m => m.role !== 'user' && m.content && String(m.content).length > 20);
      const __prev3 = __ai3.length ? String(__ai3[__ai3.length - 1].content) : '';
      __iq = (__prev3.split(/\n|\.\s|\u061F|!/)[0] || '').slice(0, 150).trim();
    }
    return await fetchSearchNote(__iq || searchQuery, __wantDeep, text);
  }
  // 🔗 طلب روابط/مواقع حقيقية = بحث حي إجباري (منع هلوسة الروابط الوهمية).
  if(/رابط|روابط|لينك|لنك|لينكات|لنكات/i.test(text)
    || /(رابط|لينك|\blink\b|\burl\b)[^\n]{0,25}(موقع|مواقع|منصة|منصات|صفحة|site|website)/i.test(text)
    || /(موقع|مواقع|منصة|منصات|site|website)[^\n]{0,25}(رابط|لينك|\blink\b|\burl\b|\blinks\b)/i.test(text)
    || /(عطني|اعطني|أعطني|هات|وريني|ابغي|أبغي|أبي|ابي|أريد|اريد|give me|show me)[^\n]{0,20}(موقع|مواقع|منصة|منصات|رابط|لينك|\bsites?\b|\bwebsites?\b|\blinks?\b)/i.test(text)){
    return await fetchSearchNote(searchQuery, __wantDeep, text);
  }
  // مسار سريع: الكلمات المفتاحية القديمة => بحث مباشر بدون تصنيف.
  if(mahaNeedsSearch(text)) return await fetchSearchNote(searchQuery, __wantDeep, text);
  // غير ذلك: فحص دلالي قصير فقط. لا نؤخر سؤالًا عاديًا عدة ثوانٍ من أجل
  // احتمال بحث؛ الكلمات الواضحة أعلاه ما زالت تفتح البحث مباشرة.
  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text, classify: true }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if(!res.ok) return null;
    const data = await res.json();
    if(!data || !data.search) return null;
    return await fetchSearchNote(searchQuery, __wantDeep, text);
  }catch(e){
    return null;
  }
}

async function fetchSearchNote(transcript, deep, q0){
  // لا تعيد المحاولة تلقائيًا في نفس رسالة المستخدم: هذا كان يضاعف زمن
  // الانتظار عند تعثّر مصدر البحث. إن لم يصل المصدر سريعًا يجيب الذكاء مباشرة.
  return await fetchSearchNoteOnce(transcript, deep, q0);
}

// دفاع واجهة مستقل: المصدر المحذوف لا يظهر حتى لو وصل من استجابة قديمة.
const REMOVED_SEARCH_SOURCE_HOST = 'news.google.com';
const REMOVED_SEARCH_SOURCE_TEXT_RE = /(?:https?:\/\/)?(?:www\.)?news\.google\.com(?:\/[^\s<>()\]]*)?/gi;
function isAllowedSearchSource(item){
  try{
    const host = new URL(item && item.url || '').hostname.toLowerCase().replace(/^www\./, '');
    return host !== REMOVED_SEARCH_SOURCE_HOST && !host.endsWith('.' + REMOVED_SEARCH_SOURCE_HOST);
  }catch(e){ return true; }
}
function withoutRemovedSearchSourceMentions(value){
  return String(value || '').replace(REMOVED_SEARCH_SOURCE_TEXT_RE, '').replace(/\s{2,}/g, ' ').trim();
}

// v628 عيب [ج]: بطاقات مصادر من منصّات اجتماعيّة لا تُسند سؤالًا معلوماتيًّا (ظهر انستغرام
// ويوتيوب تحت سؤال تاريخيّ). تُحذف إلّا إذا ذكر المستخدم المنصّة بنفسه، ولا تُفرَّغ القائمة أبدًا.
const __WEAK_SOURCE_HOSTS = {
  'instagram.com': /انستغرام|انستقرام|إنستغرام|انستا|instagram/i,
  'tiktok.com': /تيك ?توك|تيكتوك|tiktok/i,
  'pinterest.com': /بنترست|بينتريست|pinterest/i,
  'facebook.com': /فيسبوك|فيس ?بوك|facebook/i,
  'x.com': /تويتر|توتير|twitter|x\.com/i,
  'twitter.com': /تويتر|توتير|twitter/i,
  'quora.com': /كورا|quora/i,
  'threads.net': /ثريدز|threads/i,
  'snapchat.com': /سناب|سنابشات|snapchat/i,
};
const __VIDEO_WANT_RE = /فيديو|فيديوهات|مقطع|مقاطع|يوتيوب|شرح مصور|youtube|\bvideo\b|\bwatch\b/i;
function __dropWeakSources(list, rawText){
  if(!Array.isArray(list) || list.length < 2) return list;
  const t = String(rawText || '');
  const wantsVideo = __VIDEO_WANT_RE.test(t);
  const kept = list.filter(it => {
    let h = '';
    try{ h = new URL(it && it.url || '').hostname.toLowerCase().replace(/^www\.|^m\./, ''); }catch(e){ return true; }
    if(!h) return true;
    if(h === 'youtube.com' || h === 'youtu.be') return wantsVideo;
    const re = __WEAK_SOURCE_HOSTS[h];
    return !re || re.test(t);
  });
  return kept.length ? kept : list;
}

async function fetchSearchNoteOnce(transcript, deep, q0){
  // Live search is the longest silent gap in ordinary chat — up to 45s.
  const __st = (window.__chatStatus && !window.__chatStatus.__released)
    ? window.__chatStatus.step('🔍', deep ? 'يبحث في الإنترنت (بحث موسّع)…' : 'يبحث في الإنترنت…')
    : null;
  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), deep ? 25000 : 12000);
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 🖼️ Feature ②: also ask for images so informational/live-search
      // replies can show a ChatGPT-style image strip + source badges above
      // and below the answer text (data.sources/data.images below).
      body: JSON.stringify({ query: transcript, q0: q0 || '', images: __wantsImageStrip(q0 || transcript), deep: !!deep, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if(!res.ok) return null;
    const data = await res.json();
    if(!data) return null;
    const cleanResult = r => ({ ...r,
      title: withoutRemovedSearchSourceMentions(r && r.title),
      content: withoutRemovedSearchSourceMentions(r && r.content),
    });
    const searchResults = Array.isArray(data.results) ? data.results.filter(isAllowedSearchSource).map(cleanResult) : [];
    const googleResults = Array.isArray(data.google) ? data.google.filter(isAllowedSearchSource).map(cleanResult) : [];
    const parts = [];
    const cleanAnswer = withoutRemovedSearchSourceMentions(data.answer);
    if(cleanAnswer) parts.push(cleanAnswer);
    // v384: Deep Research — عدة ملخصات من زوايا مختلفة
    if(Array.isArray(data.deepAnswers) && data.deepAnswers.length > 1){
      data.deepAnswers.slice(1).forEach(a => {
        const clean = withoutRemovedSearchSourceMentions(a);
        if(clean) parts.push('[Additional perspective]: ' + clean);
      });
    }
    const __maxRes = data.deep ? 15 : 8;
    if(searchResults.length){
      searchResults.slice(0, __maxRes).forEach(r => {
        if(r && r.content) parts.push(`- ${r.title || ''} [${r.url || ''}]: ${r.content}`);
      });
    }
    // Google Custom Search results are included in the grounding alongside Tavily.
    if(googleResults.length){
      googleResults.slice(0, 3).forEach(r => {
        if(r && r.content) parts.push(`- [Google] ${r.title || ''}: ${r.content}`);
      });
    }
    // v536: حسابات التواصل الاجتماعي على نفس الموضوع — تُمرَّر للنموذج ليذكر
    // المناسب منها بالاسم والرابط، لا كبطاقات صامتة فقط.
    if(Array.isArray(data.social) && data.social.length){
      parts.push('- [Social media accounts about this exact topic — if any is clearly relevant, mention it in your answer with its @handle and link]: '
        + data.social.map(sc => `${sc.title} [${sc.url}]`).join(' | '));
    }
    if(!parts.length) return null;
    const note = `Live internet search results for the user's question (use these to give an accurate, up-to-date answer; do not mention "search" or "internet" explicitly, just answer naturally as if you know this):\n${parts.join('\n')}\nIf the results are classified ads/listings (real estate, cars, jobs...): results marked "📌 إعلان مباشر" are individual ad pages — label their link "رابط الإعلان". Results marked "🔍 صفحة بحث" are generic category/search pages — group them ALL under ONE Arabic heading line written exactly once on its own line above them: "🔗 روابط تصفح الإعلانات:" then one line per site containing the site name followed by its link. NEVER repeat the phrase "رابط تصفح الإعلانات" inside the individual lines and NEVER call them "رابط الإعلان". LAYOUT RULE: every list line MUST start with an Arabic word (keep the Latin brand name but put the Arabic name before it) so all lines stay on one straight right-to-left column. Prefer showing 📌 results first. ONLY IF your answer actually lists classified ads/listings with links, end it with this short tip in Arabic: "📞 افتح رابط الإعلان وبتلقى داخل الصفحة زر اتصال/واتساب." — if the answer contains no listings at all, DO NOT add this tip or mention it. Never claim you can provide owners' personal phone numbers as open lists. FLIGHTS: if the question is about flight tickets, list the cheapest options found (price + airline if available + booking link) and add one short Arabic note that prices change constantly and the final price is on the booking site. FRESHNESS RULE: base your answer ONLY on the search results above — STRICTLY FORBIDDEN to add programs, platforms, initiatives or facts from your own memory/training data (they may be outdated); if the search results don't mention something, don't mention it either. RELEVANCE RULE (ABSOLUTE): before using ANY search result, check it is DIRECTLY about the user's exact topic. If a result is about a different topic (e.g., motorcycles when the user asked about cars, or an unrelated product/article), you MUST completely ignore it — never mention it, never cite its link, never weave its details into your answer. It is better to use fewer results than to include one off-topic result.`;
    // 📚🖼️ Feature ② — structured data for the ChatGPT-style UI: source
    // badges (favicon+domain, from the backend's deduped `sources` field,
    // with a client-side fallback in case an older cached response lacks
    // it) and up to 4 live image URLs for the horizontal image strip.
    let sources = Array.isArray(data.sources) ? data.sources.filter(isAllowedSearchSource).slice(0, 10).map(s => ({ ...s, title: withoutRemovedSearchSourceMentions(s && s.title) })) : [];
    if(!sources.length){
      const seenHosts = new Set();
      [...searchResults, ...googleResults].forEach(r => {
        if(!r || !r.url || sources.length >= 6) return;
        let host = '';
        try{ host = new URL(r.url).hostname.replace(/^www\./, ''); }catch(e){
    if(__st) __st.fail('تعذّر'); return; }
        if(!host || seenHosts.has(host)) return;
        seenHosts.add(host);
        sources.push({ title: r.title || host, url: r.url });
      });
    }
    sources = __dropWeakSources(sources, q0 || transcript);
    const images = Array.isArray(data.images) ? data.images.slice(0, 4) : [];
    if(__st) __st.done();
    return { note, sources, images };
  }catch(e){
    console.error('[maha] search failed:', e);
    return null;
  }
}

// Heuristic: does this turn look like a request to draw/create/edit a picture?
// Used only by the classic (fallback) text pipeline, which has no real
// function-calling - the Realtime voice-to-voice mode below detects this
// itself via OpenAI's built-in tool calling instead.
const MAHA_IMAGE_KEYWORDS = [
  'ارسم','ارسمي','رسم','رسمة','صورة','سوي صورة','اعطني صورة','اعطيني صورة','ولد صورة','صمم','عدّلها','عدلها','غيّرها','غيرها',
  'draw','generate an image','create an image','make an image','make a picture','draw me','picture of','image of','design a logo','edit it','change it',
];
function mahaNeedsImage(text){
  if(!text) return false;
  const lower = text.toLowerCase();
  return MAHA_IMAGE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

// Stores the most recently generated image in the current call (base64 +
// mime), so a follow-up "edit it" request can reference it. Reset per call.
let mahaLastImageBase64 = null;
let mahaLastImageMime = null;
// مصدر ثابت لسلسلة التعديل، مع تعليمات تراكمية. هذا يمنع تمرير الناتج
// المعاد توليده كأصل جديد في كل متابعة وتراكم تغيّر الهوية أو النمط.
let mahaEditSourceBase64 = null;
let mahaEditSourceMime = null;
let mahaImageEditInstructions = [];
// Call whenever the active project changes (new/switch/delete) so مها's
// image reference never leaks from one project into another.
function mahaClearImageRef(){
  mahaLastImageBase64 = null;
  mahaLastImageMime = null;
  mahaEditSourceBase64 = null;
  mahaEditSourceMime = null;
  mahaImageEditInstructions = [];
  const mahaImgElClr = document.getElementById('mahaGenImage');
  if(mahaImgElClr){ mahaImgElClr.style.display = 'none'; mahaImgElClr.src = ''; }
}

function mahaShowImage(base64, mimeType){
  mahaLastImageBase64 = base64;
  mahaLastImageMime = mimeType || 'image/png';
  if(mahaCallMode === 'builder'){
    // Builder voice mode: never show the image inside the call bubble -
    // drop it straight into the code/preview panels instead, like every
    // other builder action, then let the call orb keep animating normally.
    let cur = getCurrent();
    if(!cur){
      const id = 'p_' + Date.now();
      cur = {id, title: 'صورة', messages: [], code: '', codeType: 'html'};
      state.projects.push(cur);
      state.currentId = id;
    }
    const dataUrl = 'data:' + mahaLastImageMime + ';base64,' + base64;
    cur.code = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b12;}img{max-width:100%;max-height:100vh;display:block;}</style></head><body><img src="' + dataUrl + '" alt=""></body></html>';
    cur.codeType = 'html';
    renderAll();
    switchWorkTab('preview');
    // Don't persist the huge base64 image into localStorage (would fill
    // storage fast). Keep a lightweight placeholder for saved state; the
    // full image stays visible in-memory for this session only.
    const fullCode = cur.code;
    cur.code = '<!-- صورة مؤقتة من مها: لم تُحفظ لتفادي امتلاء التخزين -->';
    saveState();
    cur.code = fullCode;
    return;
  }
  const el = document.getElementById('mahaGenImage');
  const orb = document.getElementById('mahaOrb');
  if(el){
    el.src = 'data:' + mahaLastImageMime + ';base64,' + base64;
    el.style.display = 'block';
  }
  if(orb) orb.style.display = 'none';
}

// Shows a real photo fetched from the live web (image URL) instead of an
// AI-generated picture - used when the user asks about a real, existing
// thing (a specific car/plane model, a place, a person...) so they see the
// true real image, not an artist's imagined approximation.
function mahaShowRealPhotoUrl(url){
  mahaLastImageBase64 = null;
  mahaLastImageMime = null;
  mahaEditSourceBase64 = null;
  mahaEditSourceMime = null;
  mahaImageEditInstructions = [];
  if(mahaCallMode === 'builder'){
    let cur = getCurrent();
    if(!cur){
      const id = 'p_' + Date.now();
      cur = {id, title: 'صورة', messages: [], code: '', codeType: 'html'};
      state.projects.push(cur);
      state.currentId = id;
    }
    cur.code = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b12;}img{max-width:100%;max-height:100vh;display:block;}</style></head><body><img src="' + url + '" alt=""></body></html>';
    cur.codeType = 'html';
    renderAll();
    switchWorkTab('preview');
    saveState();
    return;
  }
  const el = document.getElementById('mahaGenImage');
  const orb = document.getElementById('mahaOrb');
  if(el){
    el.src = url;
    el.style.display = 'block';
  }
  if(orb) orb.style.display = 'none';
}

// Searches the live web for a real photo of something that actually exists
// (a specific car/plane model, place, person...) and shows the first result.
async function mahaFindRealPhoto(query){
  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, images: true, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if(!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const data = await res.json();
    const url = Array.isArray(data.images) && data.images.length ? data.images[0] : null;
    if(!url) return { ok: false, error: 'no image found' };
    mahaShowRealPhotoUrl(url);
    return { ok: true };
  }catch(e){
    console.error('[maha] real photo search failed:', e);
    return { ok: false, error: e.message || String(e) };
  }
}

// Calls the server-side Gemini image endpoint. If `editMode` is true and an
// image already exists in this call, sends it along for editing instead of
// generating a brand new one.
async function mahaCallImageApi(promptText, useEditImage, sourceOverride){
  const body = { prompt: promptText, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() };
  const editSource = sourceOverride || (mahaEditSourceBase64 ? { b64: mahaEditSourceBase64, mime: mahaEditSourceMime } : null);
  if(useEditImage && (editSource || mahaLastImageBase64)){
    body.editImageBase64 = editSource ? editSource.b64 : mahaLastImageBase64;
    body.editMimeType = (editSource && editSource.mime) || mahaLastImageMime || 'image/png';
  }
  const res = await fetch('/api/maha-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok || !data.imageBase64) return { ok: false, error: (data && data.error) || ('HTTP ' + res.status), status: res.status };
  return { ok: true, imageBase64: data.imageBase64, mimeType: data.mimeType };
}

let mahaLastCleanImg = null; // آخر صورة نظيفة (بدون نص) — لإعادة كتابة النص بخط/لون جديد بدون رسم جديد
function mahaCombinedEditPrompt(value){
  const clean = String(value || '').trim();
  const edits = mahaImageEditInstructions.slice();
  if(clean && edits[edits.length - 1] !== clean) edits.push(clean);
  return { edits, prompt: edits.length <= 1 ? clean : ('طبّق جميع التعديلات التالية مجتمعة على الصورة الأصلية:\n' + edits.map((item, i) => (i + 1) + '. ' + item).join('\n') + '\nلا تغيّر أي شيء آخر.') };
}
async function mahaGenerateOrEditImage(promptText, editMode, textToWrite, fontStyle, textColor, rewriteTextOnly){
  try{
    // تغيير الخط/اللون/النص فقط: نعيد الكتابة على آخر صورة نظيفة بدون استدعاء الرسم
    if(rewriteTextOnly && mahaLastCleanImg && textToWrite && textToWrite.trim()){
      try{
        const nb64 = await overlayTextOnImage(mahaLastCleanImg.b64, mahaLastCleanImg.mime, textToWrite.trim(), fontStyle, textColor);
        mahaEditSourceBase64 = nb64;
        mahaEditSourceMime = 'image/png';
        mahaImageEditInstructions = [];
        mahaShowImage(nb64, 'image/png');
        return { ok: true };
      }catch(e){ console.warn('[maha] rewrite-only failed, doing full flow:', e); }
    }
    let pendingEditInstructions = null;
    let sourceOverride = null;
    if(editMode){
      sourceOverride = mahaEditSourceBase64
        ? { b64: mahaEditSourceBase64, mime: mahaEditSourceMime || 'image/png' }
        : { b64: mahaLastImageBase64, mime: mahaLastImageMime || 'image/png' };
      const combined = mahaCombinedEditPrompt(promptText);
      promptText = combined.prompt;
      pendingEditInstructions = combined.edits;
    }
    // نص عربي/أي نص مطلوب داخل الصورة: نطلب صورة بدون نص ونكتبه نحن بخط سليم
    if(textToWrite && textToWrite.trim()){
      promptText = (promptText || '') + ' (IMPORTANT: the image itself must contain NO text, NO letters, NO words at all - leave clean space near the bottom)';
    }
    // تعديل الصورة يفشل بأمان: لا نعيد الطلب عشوائيًا ولا نسقط الصورة الأصلية
    // ونولّد من الوصف وحده، لأن ذلك كان يحوّل الشخص والصورة إلى شكل جديد.
    const r = await mahaCallImageApi(promptText, editMode, sourceOverride);
    if(!r.ok) return { ok: false, error: r.error };
    let outB64 = r.imageBase64, outMime = r.mimeType;
    if(textToWrite && textToWrite.trim()){
      mahaLastCleanImg = { b64: r.imageBase64, mime: r.mimeType || 'image/png' };
      try{
        outB64 = await overlayTextOnImage(r.imageBase64, r.mimeType || 'image/png', textToWrite.trim(), fontStyle, textColor);
        outMime = 'image/png';
      }catch(e){ console.warn('[maha] text overlay failed, showing plain image:', e); outB64 = r.imageBase64; outMime = r.mimeType; }
    }
    if(!editMode){
      mahaEditSourceBase64 = outB64;
      mahaEditSourceMime = outMime || 'image/png';
      mahaImageEditInstructions = [];
    }else{
      // لا نعتمد المصدر أو التعليمات إلا بعد أن أعاد الخادم نتيجة مقبولة.
      if(!mahaEditSourceBase64 && sourceOverride){
        mahaEditSourceBase64 = sourceOverride.b64;
        mahaEditSourceMime = sourceOverride.mime || 'image/png';
      }
      mahaImageEditInstructions = pendingEditInstructions || [];
    }
    mahaShowImage(outB64, outMime);
    return { ok: true };
  }catch(e){
    console.error('[maha] image gen failed:', e);
    return { ok: false, error: e.message || String(e) };
  }
}

/* ---------- مها Realtime Voice (OpenAI gpt-realtime, true voice-to-voice) ----------
 * Newer, higher-quality call mode: instead of record -> Whisper text ->
 * LLM text -> TTS audio (the classic pipeline below, which has inherent
 * per-turn delay and a more robotic voice ceiling), this connects the
 * browser directly to OpenAI's Realtime API over WebRTC for natural,
 * low-latency, end-to-end speech-to-speech. mahaStartCall() tries this
 * first and only falls back to the classic pipeline if it fails for any
 * reason (e.g. browser without WebRTC support, network blocking WebRTC,
 * server missing the key, etc.) so the feature never just stops working. */
let mahaRtPc = null, mahaRtDc = null, mahaRtStream = null, mahaRtAudioEl = null, mahaRtActive = false, mahaRtReconnecting = false;

/* v283: مؤشر صوت المايك داخل مكالمة مها — يبين هل صوت المستخدم واصل */
let mahaMicMeterCtx = null, mahaMicMeterRaf = 0, mahaMicSilenceStart = 0, mahaMicWarned = false;
function mahaStartMicMeter(stream){
  try{
    mahaStopMicMeter();
    const wrap = document.getElementById('mahaMicMeter');
    const fill = document.getElementById('mahaMicMeterFill');
    if(!wrap || !fill || !window.AudioContext) return;
    wrap.style.display = 'block';
    mahaMicMeterCtx = new AudioContext();
    const src = mahaMicMeterCtx.createMediaStreamSource(stream);
    const analyser = mahaMicMeterCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    mahaMicSilenceStart = Date.now(); mahaMicWarned = false;
    (function tick(){
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for(let i = 0; i < buf.length; i++){ const d = Math.abs(buf[i] - 128); if(d > peak) peak = d; }
      const lvl = Math.min(100, Math.round((peak / 128) * 260));
      fill.style.width = lvl + '%';
      if(lvl > 8){ mahaMicSilenceStart = Date.now(); if(mahaMicWarned){ mahaMicWarned = false; const st = document.getElementById('mahaStateLabel'); if(st) st.textContent = ''; } }
      else if(!mahaMicWarned && Date.now() - mahaMicSilenceStart > 7000){
        mahaMicWarned = true;
        const st = document.getElementById('mahaStateLabel');
        if(st) st.textContent = '⚠️ صوتك ما يوصل — تحقق من المايك';
      }
      mahaMicMeterRaf = requestAnimationFrame(tick);
    })();
  }catch(e){ __swallow(e, "misc:app-08-maha#10"); }
}
function mahaStopMicMeter(){
  try{
    if(mahaMicMeterRaf) cancelAnimationFrame(mahaMicMeterRaf);
    mahaMicMeterRaf = 0;
    if(mahaMicMeterCtx){ mahaMicMeterCtx.close().catch(() => {}); mahaMicMeterCtx = null; }
    const wrap = document.getElementById('mahaMicMeter');
    if(wrap) wrap.style.display = 'none';
  }catch(e){ __swallow(e, "ui:app-08-maha#11"); }
}

let mahaRtCancelled = false;
async function mahaStartRealtimeCall(){
  mahaRtCancelled = false;
  const tokenRes = await fetch('/api/realtime-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: authGet('aiapp_auth_token'),
      guestId: window.getGuestId(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      mode: mahaCallMode,
      voiceGender: mahaReadVoiceGender(),
      desktop: !document.documentElement.classList.contains('mobile-ui'),
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if(tokenRes.status === 402){
    // رصيد النقاط غير كافٍ أو انتهت التجربة المجانية — لا fallback هنا
    throw new Error('__points__');
  }
  if(!tokenRes.ok || !tokenData.clientSecret){
    throw new Error((tokenData && tokenData.error) ? tokenData.error : ('realtime session failed: HTTP ' + tokenRes.status));
  }
  mahaStartPointsMeter(tokenData.mahaBudget);
  const EPHEMERAL_KEY = tokenData.clientSecret;
  if(mahaRtCancelled) throw new Error('cancelled');

  mahaRtStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  if(mahaRtCancelled){ mahaRtStream.getTracks().forEach(tr => tr.stop()); mahaRtStream = null; throw new Error('cancelled'); }
  mahaStartMicMeter(mahaRtStream);

  const pc = new RTCPeerConnection();
  mahaRtPc = pc;
  mahaRtAudioEl = new Audio();
  mahaRtAudioEl.autoplay = true;
  pc.ontrack = (e) => {
    mahaRtAudioEl.srcObject = e.streams[0];
    // Give the incoming audio a slightly larger jitter buffer so small
    // network hiccups get smoothed out instead of causing an audible
    // stutter/"choke" in Maha's voice. Supported in Chromium browsers.
    try{
      const receiver = e.receiver;
      if(receiver && 'playoutDelayHint' in receiver){ receiver.playoutDelayHint = 0.25; }
    }catch(err){ __swallow(err, "misc:app-08-maha#12"); }
  };
  pc.addTrack(mahaRtStream.getTracks()[0], mahaRtStream);

  const dc = pc.createDataChannel('oai-events');
  mahaRtDc = dc;
  dc.addEventListener('message', (e) => {
    let ev;
    try{ ev = JSON.parse(e.data); }catch(err){ return; }
    if(ev.type === 'input_audio_buffer.speech_started'){ mahaSetState('listening'); }
    else if(ev.type === 'response.created'){ mahaSetState('thinking'); }
    else if(ev.type === 'output_audio_buffer.started' || ev.type === 'response.audio.delta'){ mahaSetState('speaking'); }
    else if(ev.type === 'output_audio_buffer.stopped' || ev.type === 'response.done'){ mahaSetState('listening'); }
    else if(ev.type === 'response.function_call_arguments.done'){ mahaHandleRtFunctionCall(ev); }
    else if(ev.type === 'error'){ console.error('[maha-realtime] server error:', ev); }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: offer.sdp,
    headers: {
      Authorization: 'Bearer ' + EPHEMERAL_KEY,
      'Content-Type': 'application/sdp',
    },
  });
  if(!sdpResponse.ok){
    const errText = await sdpResponse.text().catch(() => '');
    throw new Error('SDP exchange failed: ' + sdpResponse.status + ' ' + errText.slice(0, 200));
  }
  const answerSdp = await sdpResponse.text();
  if(mahaRtCancelled) throw new Error('cancelled');
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime connection timeout')), 10000);
    pc.addEventListener('connectionstatechange', () => {
      if(pc.connectionState === 'connected'){ clearTimeout(timeout); resolve(); }
      else if(pc.connectionState === 'failed' || pc.connectionState === 'closed'){ clearTimeout(timeout); reject(new Error('Realtime connection ' + pc.connectionState)); }
    });
  });

  mahaRtActive = true;
  mahaSetState('listening');

  // If the connection drops mid-call (e.g. brief network hiccup) after we
  // were already connected, try to silently reconnect once instead of
  // leaving Maha stuck or forcing the user to restart the call manually.
  let mahaRtDisconnectTimer = null;
  pc.addEventListener('connectionstatechange', () => {
    if(pc !== mahaRtPc) return; // a newer call already replaced this one
    if(pc.connectionState === 'connected'){
      // Recovered on its own - cancel any pending reconnect.
      if(mahaRtDisconnectTimer){ clearTimeout(mahaRtDisconnectTimer); mahaRtDisconnectTimer = null; }
      return;
    }
    if(pc.connectionState === 'failed' && mahaCallActive && !mahaRtReconnecting){
      // Truly dead - reconnect immediately.
      if(mahaRtDisconnectTimer){ clearTimeout(mahaRtDisconnectTimer); mahaRtDisconnectTimer = null; }
      mahaRtReconnecting = true;
      mahaSetState('thinking');
      mahaEndRealtimeCall();
      mahaStartRealtimeCall()
        .then(() => { mahaRtReconnecting = false; })
        .catch((e) => {
          mahaRtReconnecting = false;
          console.error('[maha] auto-reconnect failed:', e);
          mahaSetState('error', t('mahaConnectionLost') || 'تعذر إعادة الاتصال');
        });
    } else if(pc.connectionState === 'disconnected' && mahaCallActive && !mahaRtReconnecting){
      // Brief network hiccup - WebRTC often self-recovers within a few
      // seconds. Wait before tearing down the whole call so we don't cut
      // Maha off mid-sentence for a blip that resolves on its own.
      if(mahaRtDisconnectTimer) clearTimeout(mahaRtDisconnectTimer);
      mahaRtDisconnectTimer = setTimeout(() => {
        mahaRtDisconnectTimer = null;
        if(pc !== mahaRtPc || !mahaCallActive || mahaRtReconnecting) return;
        if(pc.connectionState !== 'disconnected' && pc.connectionState !== 'failed') return; // already recovered
        mahaRtReconnecting = true;
        mahaSetState('thinking');
        mahaEndRealtimeCall();
        mahaStartRealtimeCall()
          .then(() => { mahaRtReconnecting = false; })
          .catch((e) => {
            mahaRtReconnecting = false;
            console.error('[maha] auto-reconnect failed:', e);
            mahaSetState('error', t('mahaConnectionLost') || 'تعذر إعادة الاتصال');
          });
      }, 1500);
    }
  });
}

// Handles a completed function call requested by the model over the Realtime
// data channel (generate_image / edit_image / search_web). Runs the real
// action server-side, sends the result back as a function_call_output, then
// asks the model to continue the conversation using that result.
// 📷 عين مها — كاميرا لأصحاب الهمم (وصف المحيط + قراءة النصوص بصوتها)
let mahaCamStream = null;
async function mahaCameraOn(){
  if(mahaCamStream) return true;
  try{
    mahaCamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    const v = document.getElementById('mahaCamPreview');
    if(v){ v.srcObject = mahaCamStream; v.style.display = 'block'; try{ await v.play(); }catch(e){ __swallow(e, "ui:app-08-maha#13"); } }
    const b = document.getElementById('btnMahaCamera');
    if(b) b.style.background = 'rgba(64,200,120,.55)';
    return true;
  }catch(e){ console.error('[maha-camera] failed:', e); mahaCamStream = null; return false; }
}
function mahaCameraOff(){
  if(mahaCamStream){ try{ mahaCamStream.getTracks().forEach(tr => tr.stop()); }catch(e){ __swallow(e, "misc:app-08-maha#14"); } mahaCamStream = null; }
  const v = document.getElementById('mahaCamPreview');
  if(v){ v.style.display = 'none'; v.srcObject = null; }
  const b = document.getElementById('btnMahaCamera');
  if(b) b.style.background = 'rgba(255,255,255,.14)';
}
async function mahaCaptureCamFrame(){
  const v = document.getElementById('mahaCamPreview');
  if(!v || !mahaCamStream) return null;
  // انتظر لحظة حتى تثبت الصورة بعد فتح الكاميرا
  if(!v.videoWidth) await new Promise(r => setTimeout(r, 900));
  if(!v.videoWidth) return null;
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
async function mahaLookCamera(question){
  const on = await mahaCameraOn();
  if(!on) return { ok: false, message: 'Camera could not be opened (permission denied or unavailable). Tell the user to allow camera access.' };
  await new Promise(r => setTimeout(r, 600));
  const frame = await mahaCaptureCamFrame();
  if(!frame) return { ok: false, message: 'Could not capture a camera frame. Ask the user to try again.' };
  try{
    const desc = await callGemini([
      { role: 'system', content: 'أنت عين مساعد صوتي لشخص كفيف أو ضعيف البصر. انظر للصورة الملتقطة من كاميرا هاتفه وأجب على سؤاله بدقة وعملية: صف المشهد والعناصر المهمة ومواقعها (يمين/يسار/أمام)، واقرأ أي نص ظاهر حرفياً بالكامل (أدوية، فواتير، لافتات، قوائم، مبالغ). اكتب الإجابة مباشرة بلغة السؤال نفسها، بدون مقدمات ولا رموز، لأنها ستُنطق صوتياً.' },
      { role: 'user', content: question || 'صف لي ما تراه أمامي بدقة', images: [{ mime: 'image/jpeg', dataUrl: frame }] },
    ], null);
    if(desc && desc.trim()) return { ok: true, description: desc.trim() + ' — Speak this to the user naturally in their language.' };
    return { ok: false, message: 'Vision analysis returned nothing. Ask the user to point the camera again.' };
  }catch(e){
    console.error('[maha-camera] vision failed:', e);
    return { ok: false, message: 'Vision analysis failed. Tell the user to try again in a moment.' };
  }
}
(function(){
  const b = document.getElementById('btnMahaCamera');
  if(b) b.onclick = () => { if(mahaCamStream) mahaCameraOff(); else mahaCameraOn(); };
})();

async function mahaHandleRtFunctionCall(ev){
  if(!mahaRtDc || mahaRtDc.readyState !== 'open') return;
  let args = {};
  try{ args = JSON.parse(ev.arguments || '{}'); }catch(e){ /* ignore */ }

  let output = { ok: false };
  try{
    mahaSetState('thinking');
    if(ev.name === 'generate_image'){
      const r = await mahaGenerateOrEditImage(args.prompt || '', false, args.text_to_write || '', args.font_style || '', args.text_color || '', false);
      output = r.ok ? { ok: true, message: 'Image generated and shown to the user on screen.' } : { ok: false, message: 'Image generation failed: ' + (r.error || 'unknown error') };
    }else if(ev.name === 'edit_image'){
      if(!mahaLastImageBase64){
        output = { ok: false, message: 'No image exists yet in this call to edit - tell the user to first ask you to create one.' };
      }else{
        const r = await mahaGenerateOrEditImage(args.instruction || '', true, args.text_to_write || '', args.font_style || '', args.text_color || '', !!args.rewrite_text_only);
        output = r.ok ? { ok: true, message: 'Image edited and shown to the user on screen.' } : { ok: false, message: 'Image edit failed: ' + (r.error || 'unknown error') };
      }
    }else if(ev.name === 'search_web'){
      const searchMsg = await mahaMaybeSearchForced(args.query || '');
      output = searchMsg ? { ok: true, results: searchMsg } : { ok: false, message: 'No useful search results found; answer from your own knowledge and say briefly if unsure.' };
    }else if(ev.name === 'find_real_photo'){
      const r = await mahaFindRealPhoto(args.query || '');
      output = r.ok ? { ok: true, message: 'A real photo was found on the web and shown to the user on screen - do not describe it in detail, just briefly confirm you found and showed it.' } : { ok: false, message: 'Could not find a real photo, tell the user briefly and offer to draw an artist impression instead if they want.' };
    }else if(ev.name === 'build_app'){
      const ok = await buildCodeFromPrompt(args.description || '');
      output = ok ? { ok: true, message: 'App/website built and shown to the user in the code and preview panels.' } : { ok: false, message: 'Build failed, tell the user briefly.' };
    }else if(ev.name === 'make_video'){
      handleVoiceVideoIntent(args.description || '');
      output = { ok: true, message: 'Video generation started and shown to the user; tell them briefly it is on the way.' };
    }else if(ev.name === 'look_camera'){
      output = await mahaLookCamera(args.question || '');
    }else if(ev.name === 'remember_info'){
      try{
        const tk = authGet('aiapp_auth_token');
        if(!tk){ output = { ok: false, message: 'User is a guest - memory only works for logged-in users; do not mention this unless asked.' }; }
        else{
          const r = await fetch('/api/system?action=memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tk, op: 'append', fact: String(args.fact || '').slice(0, 200) }) });
          output = r.ok ? { ok: true, message: 'Saved to long-term memory silently. Continue the conversation naturally without mentioning it.' } : { ok: false, message: 'Memory save failed silently; continue normally.' };
        }
      }catch(e){ output = { ok: false, message: 'Memory save failed silently; continue normally.' }; }
    }else if(ev.name === 'set_reminder'){
      const r = await mahaSetReminder(args);
      output = r.ok ? { ok: true, message: 'Reminder set successfully.' } : { ok: false, message: 'Could not set reminder: ' + (r.error || 'unknown error') };
    }else{
      output = { ok: false, message: 'Unknown tool.' };
    }
  }catch(e){
    console.error('[maha-realtime] function call failed:', ev.name, e);
    output = { ok: false, message: 'Tool execution error.' };
  }

  try{
    mahaRtDc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(output) },
    }));
    mahaRtDc.send(JSON.stringify({ type: 'response.create' }));
  }catch(e){ console.error('[maha-realtime] failed to send function result:', e); }
}

// Like mahaMaybeSearch, but always searches regardless of keyword heuristics
// (used by the Realtime tool-call path, where the model itself already
// decided a search is needed).
async function mahaMaybeSearchForced(query){
  if(!query) return null;
  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if(!res.ok) return null;
    const data = await res.json();
    if(!data) return null;
    const searchResults = Array.isArray(data.results) ? data.results.filter(isAllowedSearchSource).map(r => ({ ...r,
      title: withoutRemovedSearchSourceMentions(r && r.title),
      content: withoutRemovedSearchSourceMentions(r && r.content),
    })) : [];
    const parts = [];
    const cleanAnswer = withoutRemovedSearchSourceMentions(data.answer);
    if(cleanAnswer) parts.push(cleanAnswer);
    if(searchResults.length){
      searchResults.slice(0, 8).forEach(r => {
        if(r && r.content) parts.push(`- ${r.title || ''} [${r.url || ''}]: ${r.content}`);
      });
    }
    return parts.length ? parts.join('\n') : null;
  }catch(e){
    console.error('[maha] forced search failed:', e);
    return null;
  }
}

// Gets the user's current device coordinates (cached in localStorage for up
// to an hour so repeated prayer-time reminders in one session don't keep
// re-prompting for location permission).
function mahaGetLocation(){
  return new Promise((resolve) => {
    try{
      const cached = JSON.parse(localStorage.getItem('aiapp_last_geo') || 'null');
      if(cached && (Date.now() - cached.ts) < 3600000){ resolve({ lat: cached.lat, lng: cached.lng }); return; }
    }catch(e){ __swallow(e, "misc:app-08-maha#15"); }
    if(!navigator.geolocation){ resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try{ localStorage.setItem('aiapp_last_geo', JSON.stringify(Object.assign({ ts: Date.now() }, loc))); }catch(e){ __swallow(e, "save:app-08-maha#16"); }
        resolve(loc);
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 3600000 }
    );
  });
}

// Handles the set_reminder tool call from مها: converts the model's local
// date/hour/minute (or prayer_name/offset) into the request the /api/reminders
// backend expects, using the browser's own clock/timezone for "once"/"daily"
// types, and the device's real GPS coordinates for "prayer" types.
async function mahaSetReminder(args){
  try{
    const token = authGet('aiapp_auth_token');
    if(!token) return { ok: false, error: 'not logged in' };

    const type = args.type === 'prayer' ? 'prayer' : (args.type === 'daily' ? 'daily' : 'once');
    const body = { type, message: args.message || 'تذكير' };

    if(type === 'once'){
      const now = new Date();
      const dateStr = args.date || (now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0'));
      const [y,m,d] = dateStr.split('-').map(n=>parseInt(n,10));
      const hour = Number.isFinite(args.hour) ? args.hour : now.getHours();
      const minute = Number.isFinite(args.minute) ? args.minute : 0;
      const target = new Date(y, (m||1)-1, d||1, hour, minute, 0, 0);
      body.timeISO = target.toISOString();
    }else if(type === 'daily'){
      // Convert the local hour/minute the model gave us into their UTC
      // equivalent once (matches how /api/check-reminders compares against
      // now.getUTCHours()/getUTCMinutes() every minute).
      const now = new Date();
      const hour = Number.isFinite(args.hour) ? args.hour : 8;
      const minute = Number.isFinite(args.minute) ? args.minute : 0;
      const localTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
      body.hour = localTarget.getUTCHours();
      body.minute = localTarget.getUTCMinutes();
    }else if(type === 'prayer'){
      const loc = await mahaGetLocation();
      if(!loc) return { ok: false, error: 'location unavailable' };
      body.prayerName = args.prayer_name || 'Asr';
      body.offsetMinutes = Number.isFinite(args.offset_minutes) ? args.offset_minutes : 0;
      body.lat = loc.lat;
      body.lng = loc.lng;
    }

    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    if(!res.ok) return { ok: false, error: 'server error' };
    await mahaEnsurePushSubscribed();
    return { ok: true };
  }catch(e){
    console.error('[maha] set_reminder failed:', e);
    return { ok: false, error: String(e) };
  }
}

// Ensures the browser has an active Web Push subscription registered with
// the backend so /api/check-reminders can actually deliver notifications for
// any reminders the user just set - runs once per session, silently no-ops
// if the user denies notification permission or push isn't supported.
let mahaPushSubscribeAttempted = false;
async function mahaEnsurePushSubscribed(){
  if(mahaPushSubscribeAttempted) return;
  mahaPushSubscribeAttempted = true;
  try{
    if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const token = authGet('aiapp_auth_token');
    if(!token) return;
    let permission = Notification.permission;
    if(permission === 'default') permission = await Notification.requestPermission();
    if(permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      const keyRes = await fetch('/api/vapid-public-key');
      const keyData = await keyRes.json();
      if(!keyData || !keyData.publicKey) return;
      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }
    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
  }catch(e){ console.error('[maha] push subscribe failed:', e); }
}

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i = 0; i < rawData.length; ++i){ outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

function mahaEndRealtimeCall(){
  mahaRtCancelled = true;
  mahaRtActive = false;
  if(mahaRtDc){ try{ mahaRtDc.close(); }catch(e){ __swallow(e, "misc:app-08-maha#17"); } mahaRtDc = null; }
  if(mahaRtPc){ try{ mahaRtPc.close(); }catch(e){ __swallow(e, "misc:app-08-maha#18"); } mahaRtPc = null; }
  mahaStopMicMeter();
  if(mahaRtStream){ mahaRtStream.getTracks().forEach(tr => tr.stop()); mahaRtStream = null; }
  if(mahaRtAudioEl){ try{ mahaRtAudioEl.pause(); mahaRtAudioEl.srcObject = null; }catch(e){ __swallow(e, "misc:app-08-maha#19"); } mahaRtAudioEl = null; }
}

async function mahaCallLoop(){
  while(mahaCallActive){
    mahaSetState('listening');
    let blob;
    try{
      blob = await mahaRecordUntilSilence();
    }catch(e){
      var __m = mahaMicMsg(e);
      mahaSetState('error', __m);
      mahaCallActive = false;
      alert(__m);
      break;
    }
    if(!mahaCallActive) break;
    if(!blob || blob.size < 800 || mahaLastPeakRms < 0.03){
      // Essentially silent/noise-only turn - the mic didn't pick up real speech,
      // just background noise. Don't send it to speech-to-text at all (avoids
      // the model hallucinating words from silence, and avoids replying unprompted).
      mahaLowMicStreak++;
      if(mahaLowMicStreak >= 3){
        mahaSetState('error', t('mahaLowMic'));
        await new Promise(r => setTimeout(r, 1800));
        mahaLowMicStreak = 0;
      }
      continue;
    }

    mahaSetState('thinking');
    try{
      const audioBase64 = await blobToBase64(blob);
      const res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000), // v600: صفر مهلة = تعليق أبديّ
        body: JSON.stringify({ audioBase64, mimeType: blob.type, lang: (typeof lang !== 'undefined' ? lang : 'ar'), token: authGet('aiapp_auth_token'), guestId: window.getGuestId() }),
      });
      const data = await res.json();
      if(!mahaCallActive) break;
      if(!res.ok){
        console.error('[maha] stt failed:', res.status, data);
        const detail = (data && data.error) ? String(data.error) : ('HTTP ' + res.status);
        mahaSetState('error', t('mahaSttError') + ' (' + detail.slice(0, 80) + ')');
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      const transcript = (data && data.text ? data.text : '').trim();
      if(!transcript){
        mahaSetState('error', t('mahaNoSpeech'));
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      mahaLowMicStreak = 0;

      // Remember the language Whisper actually detected in the caller's own
      // speech (not the site's UI language toggle), so Maha's spoken reply
      // uses a matching native voice - this is what makes her work correctly
      // for a caller speaking Nepali/Hindi/Urdu/Bengali/French/English even
      // if the app's UI is still set to Arabic.
      if(data && data.language) mahaReplyLang = data.language;

      // Same approach real voice assistants (Siri, Google Assistant) use: if the
      // speech-to-text engine itself flags low confidence in what it heard, don't
      // guess an answer to a possibly-wrong transcript — ask the user to repeat.
      if(data && data.lowConfidence){
        console.log('[maha] low-confidence transcript, asking user to repeat:', transcript);
        mahaSetState('speaking');
        await mahaSpeak(t('mahaAskRepeat'));
        continue;
      }

      mahaHistory.push({ role: 'user', content: transcript });
      if(mahaHistory.length > 12) mahaHistory = mahaHistory.slice(-12);

      // Classic pipeline has no real function-calling like the Realtime mode.
      // A previous image is sent back only when this turn explicitly refers to
      // editing it; a new-image request must always start from a clean canvas.
      if(mahaNeedsImage(transcript)){
        mahaSetState('thinking');
        const editMode = !!mahaLastImageBase64 && !!(window.__isExplicitImageEdit && window.__isExplicitImageEdit(transcript));
        const imgResult = await mahaGenerateOrEditImage(transcript, editMode);
        let imgReply;
        if(imgResult.ok){
          imgReply = editMode ? t('mahaImageEditedReply') : t('mahaImageReadyReply');
        }else{
          imgReply = t('mahaImageFailedReply');
        }
        mahaHistory.push({ role: 'assistant', content: imgReply });
        if(mahaHistory.length > 12) mahaHistory = mahaHistory.slice(-12);
        mahaSetState('speaking');
        await mahaSpeak(imgReply);
        continue;
      }

      const mahaNowStr = new Date().toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
      const mahaDateSystemMsg = `The current real-world date and time right now is: ${mahaNowStr} (Gulf Standard Time, UAE). Always treat this as the true current date - never assume any other date, and never assume events after this date "haven't happened yet" just because you are unsure; if something is dated on or before this date, treat it as already having happened, and answer using your best knowledge plus common sense reasoning about the timeline. If truly asked about something very recent you can't know for certain, say so briefly instead of guessing wrong.`;

      const mahaSearchSystemMsg = await mahaMaybeSearch(transcript);
      // Persona swap: male caller -> "Abdullah" (male voice/persona), female
      // caller -> "Maha" (female voice/persona). mahaDetectedGender is the
      // accumulated pitch-based detection from the caller's own voice.
      const mahaPersonaName = mahaDetectedGender === 'male' ? 'Abdullah' : 'Maha';
      const mahaPersonaGenderDesc = mahaDetectedGender === 'male' ? 'male' : 'female';
      const mahaSystemPrompt = MAHA_SYSTEM_PROMPT_TEMPLATE
        .replace(/\{\{NAME\}\}/g, mahaPersonaName)
        .replace(/\{\{GENDER_DESC\}\}/g, mahaPersonaGenderDesc);
      const mahaSystemMsgs = [{ role: 'system', content: mahaSystemPrompt }, { role: 'system', content: mahaDateSystemMsg }];
      if(!mahaIntroduced){
        mahaSystemMsgs.push({ role: 'system', content: `This is the very first reply of the call. Before answering the user's message, briefly introduce yourself by saying your name is "${mahaPersonaName}" (in the same language/dialect you are replying in), then answer their message naturally in the same short reply - e.g. like "I'm ${mahaPersonaName}, ..." followed by your actual answer. Do this ONLY this one time.` });
        mahaIntroduced = true;
      }
      if(mahaSearchSystemMsg) mahaSystemMsgs.push({ role: 'system', content: mahaSearchSystemMsg.note });
      const messages = [...mahaSystemMsgs, ...mahaHistory];

      let reply = '';
      const order = ['gemini', 'openai', ...AUTO_FALLBACK_ORDER.filter(p => p !== 'gemini' && p !== 'openai' && p !== 'groq'), 'groq'];
      let lastErr = null;
      for(const providerKey of order){
        try{ reply = await callProviderAI(providerKey, messages); lastErr = null; break; }
        catch(e){ console.error('[maha] provider', providerKey, 'failed:', e); lastErr = e; continue; }
      }
      if(!mahaCallActive) break;
      if(lastErr && !reply){
        console.error('[maha] all providers failed');
        mahaSetState('error', t('mahaConnectionError'));
        await new Promise(r => setTimeout(r, 1800));
        continue;
      }
      console.log('[maha] reply:', reply);

      mahaHistory.push({ role: 'assistant', content: reply });
      if(mahaHistory.length > 12) mahaHistory = mahaHistory.slice(-12);

      mahaSetState('speaking');
      await mahaSpeak(reply);
    }catch(e){ console.error('[maha] turn error', e); }
  }
}

// 💰 عداد نقاط مها داخل المكالمة: يظهر تحت الاسم وينقص كل دقيقة (10 نقاط).
let mahaPointsTimer = null;
function mahaStopPointsMeter(){
  if(mahaPointsTimer){ clearInterval(mahaPointsTimer); mahaPointsTimer = null; }
  const el = document.getElementById('mahaPointsMeter');
  if(el) el.style.display = 'none';
}
function mahaStartPointsMeter(budget){
  try{
    mahaStopPointsMeter();
    const el = document.getElementById('mahaPointsMeter');
    const val = document.getElementById('mahaPointsMeterValue');
    if(!el || !val) return;
    if(!budget || budget.unlimited){ return; } // المالك: بلا عداد
    let pts = Number(budget.points) || 0;
    let trial = !!budget.trial;
    const isGuest = !!budget.guest;
    val.textContent = trial ? '🎁 1:00' : String(pts);
    el.style.display = 'flex';
    const isAr = (typeof lang !== 'undefined' ? lang : 'ar') === 'ar';
    const endGently = ()=>{
      mahaStopPointsMeter();
      try{ mahaEndCall(); }catch(e){ __swallow(e, "points:app-08-maha#20"); }
      setTimeout(()=>{
        try{
          if(confirm(isAr ? 'خلصت نقاطك 🌸 تبي تشحن نقاط عشان نكمل سوالفنا؟' : 'Your points ran out 🌸 Top up to keep talking with me?')){
            try{ document.getElementById('btnSettings').click(); }catch(e){ __swallow(e, "points:app-08-maha#21"); }
            try{ document.querySelector('.pointsPackBtn')?.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){ __swallow(e, "points:app-08-maha#22"); }
          }
        }catch(e){ __swallow(e, "points:app-08-maha#23"); }
      }, 400);
    };
    mahaPointsTimer = setInterval(async ()=>{
      if(!mahaCallActive){ mahaStopPointsMeter(); return; }
      try{
        if(trial){
          trial = false;
          if(isGuest){ endGently(); return; } // ضيف: دقيقة تجريبية وحدة فقط
          try{
            await fetch('/api/points', { method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ action:'maha-trial-used', token: authGet('aiapp_auth_token') }) });
          }catch(e){ __swallow(e, "auth:app-08-maha#24"); }
          if(pts < 10){ endGently(); return; }
          val.textContent = String(pts);
          return;
        }
        const r = await fetch('/api/points', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'consume', amount:10, reason:'maha-minute', token: authGet('aiapp_auth_token') }) });
        const d = await r.json().catch(()=>({}));
        if(d && d.ok){
          if(typeof d.points === 'number' && isFinite(d.points)){ pts = d.points; val.textContent = String(pts); }
        } else if(d && d.reason === 'insufficient'){
          endGently();
        }
      }catch(e){ /* خطأ شبكة مؤقت — نحاول الدقيقة الجاية */ }
    }, 60000);
  }catch(e){ __swallow(e, "points:app-08-maha#25"); }
}

function mahaEndCall(){
  mahaCallActive = false;
  mahaStopPointsMeter();
  mahaLowMicStreak = 0;
  try{ mahaCameraOff(); }catch(e){ __swallow(e, "points:app-08-maha#26"); }
  if(mahaOrbEl) mahaOrbEl.style.transform = '';
  mahaEndRealtimeCall();
  mahaStopVad();
  mahaStopStream();
  mahaStopInterruptListener();
  if(mahaMediaRecorder && mahaMediaRecorder.state === 'recording'){ try{ mahaMediaRecorder.stop(); }catch(e){ __swallow(e, "ui:app-08-maha#27"); } }
  if(mahaCurrentAudio){ try{ mahaCurrentAudio.pause(); }catch(e){ __swallow(e, "misc:app-08-maha#28"); } mahaCurrentAudio = null; }
  stopAllSpeaking();
  if(mahaCallScreenEl) mahaCallScreenEl.style.display = 'none';
  if(btnMahaEl) btnMahaEl.style.display = 'flex';
  mahaSetState('idle');
  mahaCallMode = 'assistant';
}

let mahaCallMode = 'assistant'; // 'assistant' (مها) or 'builder' (voice tab)
// v500: رسالة صريحة بدل الصمت عند تعذّر المايك — تُميّز رفض الإذن / لا يوجد جهاز / مشغول.
function mahaMicMsg(e){
  var L = "ar"; try{ L = localStorage.getItem("aiapp_lang") || "ar"; }catch(_){ /* guard-ok: unavailable storage uses the Arabic fallback. */ }
  var ar = L === "ar";
  var n = (e && e.name) ? String(e.name) : "";
  if(/NotAllowed|Permission|Security/i.test(n))
    return ar ? "🎤 المايك مرفوض. اضغط 🔒 في شريط العنوان ← Microphone ← Allow ثمّ أعد المحاولة."
             : "🎤 Microphone blocked. Click 🔒 in the address bar → Microphone → Allow, then try again.";
  if(/NotFound|DevicesNotFound|OverconstrainedError/i.test(n))
    return ar ? "🎤 ما في ميكروفون موصول بالجهاز." : "🎤 No microphone found on this device.";
  if(/NotReadable|TrackStart|Aborted/i.test(n))
    return ar ? "🎤 المايك مشغول ببرنامج ثاني. سكّره وجرّب مرّة ثانية." : "🎤 The mic is used by another app. Close it and try again.";
  if(n === "__timeout__")
    return ar ? "🎤 ما وصلني إذن المايك. أجب على طلب الإذن، أو اضغط 🔒 في شريط العنوان ← Microphone ← Allow، ثمّ اضغط مها مرّة ثانية."
             : "🎤 No mic permission yet. Answer the browser prompt, or click 🔒 in the address bar → Microphone → Allow, then tap Maha again.";
  return (ar ? "🎤 تعذّر فتح المايك" : "🎤 Could not open the microphone") + (n ? " (" + n + ")" : "");
}
// فحص مسبق: نطلب الإذن قبل فتح شاشة النداء، فلا تتجمّد الشاشة ١٢ ثانية بلا سبب ظاهر.
async function mahaMicPreflight(){
  var perm = "";
  try{ perm = (await navigator.permissions.query({ name: "microphone" })).state; }catch(_){ /* guard-ok: unsupported Permissions API falls through to getUserMedia. */ }
  if(perm === "denied") return mahaMicMsg({ name: "NotAllowedError" });
  try{
    // If the permission prompt is answered AFTER the 15s race rejected, the
    // stream still arrives with nobody left to stop it - the mic stays hot.
    var __gum = navigator.mediaDevices.getUserMedia({ audio: true });
    __gum.then(function(st){ try{ st.getTracks().forEach(function(tr){ tr.stop(); }); }catch(_){ /* guard-ok */ } });
    var s = await Promise.race([
      __gum,
      new Promise(function(_res, rej){ setTimeout(function(){ rej({ name: "__timeout__" }); }, 15000); })
    ]);
    s.getTracks().forEach(function(tr){ try{ tr.stop(); }catch(_){ /* guard-ok: an already-ended track needs no cleanup. */ } });
    return null;
  }catch(e){ console.error("[maha] mic preflight failed:", e); return mahaMicMsg(e); }
}

async function mahaStartCallInner(mode){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    alert(t('micNotSupported'));
    return;
  }
  var __ar = true; try{ __ar = (localStorage.getItem("aiapp_lang") || "ar") === "ar"; }catch(_){ /* guard-ok: unavailable storage retains the Arabic fallback. */ }
  mahaCallMode = mode === 'builder' ? 'builder' : 'assistant';
  if(mahaCallMode !== 'builder'){ await mahaEnsureVoiceChosen(); }
  if(mahaCallScreenEl){
    mahaCallScreenEl.style.display = "flex";
    if(mahaOrbEl) mahaOrbEl.style.display = "flex";
    mahaSetState("thinking", __ar ? "🎤 بانتظار إذن المايك…" : "🎤 Waiting for mic permission…");
    if(typeof mahaPositionOnOpen === "function") mahaPositionOnOpen();
  }
  var __micErr = await mahaMicPreflight();
  if(__micErr){
    mahaSetState("error", __micErr);
    if(mahaCallScreenEl) mahaCallScreenEl.style.display = "none";
    alert(__micErr);
    return;
  }
  if(btnMahaEl) btnMahaEl.style.display = 'none';
  stopAllSpeaking();
  mahaHistory = [];
  mahaAllPitchSamples = [];
  mahaDetectedGender = mahaReadVoiceGender();
  mahaIntroduced = false;
  // ملاحظة: لا نمسح مرجع الصورة الأخيرة هنا — يبقى ثابت حتى يبدأ المستخدم "+ مشروع جديد" فعليًا
  const mahaImgElStart = document.getElementById('mahaGenImage');
  if(mahaImgElStart && !mahaLastImageBase64){ mahaImgElStart.style.display = 'none'; mahaImgElStart.src = ''; }
  if(mahaOrbEl) mahaOrbEl.style.display = mahaCallMode === 'builder' ? 'none' : 'flex';
  if(mahaWaveEl) mahaWaveEl.style.display = mahaCallMode === 'builder' ? 'flex' : 'none';
  const mahaNameLabelEl = document.getElementById('mahaCallNameLabel');
  if(mahaNameLabelEl) mahaNameLabelEl.textContent = mahaCallMode === 'builder' ? (t('voiceTabAssistantName') || 'المساعد') : 'مها';
  if(mahaCallMode !== 'builder') mahaUpdatePersonaUI();
  mahaCallActive = true;
  if(mahaCallScreenEl){
    mahaCallScreenEl.style.display = 'flex';
    mahaCallScreenEl.classList.toggle('maha-builder-mode', mahaCallMode === 'builder');
    if(typeof mahaPositionOnOpen === 'function') mahaPositionOnOpen();
  }
  // Try the new natural voice-to-voice mode (OpenAI Realtime) first. Only if
  // that fails for any reason do we fall back to the classic record ->
  // Whisper -> LLM -> TTS pipeline, so the call feature itself never breaks.
  mahaSetState('thinking');
  try{
    await Promise.race([
      mahaStartRealtimeCall(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime setup timed out')), 12000)),
    ]);
    return;
  }catch(e){
    if(e && e.message === '__points__'){
      // الرصيد خلص — رسالة لطيفة وإنهاء بدون fallback
      mahaSetState('error', t('mahaNoPoints'));
      setTimeout(() => { mahaEndCall(); }, 2600);
      return;
    }
    console.error('[maha] realtime mode failed, falling back to classic pipeline:', e);
    mahaEndRealtimeCall();
  }
  if(!mahaCallActive) return;
  if(!window.MediaRecorder){
    mahaSetState('error', t('micNotSupported'));
    return;
  }
  // Skip the spoken greeting - jump straight to listening so Maha replies
  // to whatever the user says first, without any intro audio.
  if(mahaCallActive) mahaCallLoop();
}

// Two quick taps (or two different entry points) used to open two live calls at
// once: two microphones and double metering. Thin wrapper only - the original
// body is untouched, now mahaStartCallInner().
let mahaCallStarting = false;
async function mahaStartCall(mode){
  if(mahaCallActive || mahaCallStarting) return;
  mahaCallStarting = true;
  try{ return await mahaStartCallInner(mode); }
  finally{ mahaCallStarting = false; }
}

if(btnMahaEl) btnMahaEl.onclick = () => { mahaUnlockAudio(); mahaStartCall(); };
if(btnMahaEndCallEl) btnMahaEndCallEl.onclick = () => { mahaEndCall(); };

// v273: One-time intro tour for brand-new users — points at مها button
// and the stock-ticker collapse arrow. Runs once ever (localStorage flag),
// auto-dismisses after ~5s or on first tap. Translated to all 14 languages.
(function introTour(){
  let seen = false;
  try{ seen = !!localStorage.getItem('introTourDone'); }catch(e){ seen = true; }
  if(seen) return;
  const L = (function(){ try{ return localStorage.getItem('aiapp_lang') || 'ar'; }catch(e){ return 'ar'; } })();
  const T = {
    ar:['مساعدتك الصوتية 🎙️ — تقدر تحركها وين ما تبي','من هنا تطوي شريط الأسهم'],
    en:['Your voice assistant 🎙️ — you can drag it anywhere','Tap here to collapse the stock ticker'],
    fr:['Votre assistante vocale 🎙️ — déplacez-la où vous voulez','Appuyez ici pour replier le bandeau boursier'],
    hi:['आपकी वॉयस असिस्टेंट 🎙️ — इसे कहीं भी खींचें','स्टॉक टिकर छिपाने के लिए यहाँ दबाएँ'],
    ur:['آپ کی صوتی معاون 🎙️ — اسے کہیں بھی گھسیٹیں','اسٹاک ٹکر چھپانے کے لیے یہاں دبائیں'],
    bn:['আপনার ভয়েস সহকারী 🎙️ — যেকোনো জায়গায় টেনে নিন','স্টক টিকার লুকাতে এখানে চাপুন'],
    ne:['तपाईंको आवाज सहायक 🎙️ — जहाँ पनि तान्नुहोस्','स्टक टिकर लुकाउन यहाँ थिच्नुहोस्'],
    id:['Asisten suara Anda 🎙️ — seret ke mana saja','Ketuk di sini untuk menutup ticker saham'],
    fil:['Ang iyong voice assistant 🎙️ — i-drag kahit saan','Pindutin ito para itago ang stock ticker'],
    tr:['Sesli asistanınız 🎙️ — istediğiniz yere sürükleyin','Hisse bandını gizlemek için buraya dokunun'],
    zh:['您的语音助手 🎙️ — 可拖动到任意位置','点这里收起股票行情条'],
    ru:['Ваш голосовой помощник 🎙️ — перетащите куда угодно','Нажмите здесь, чтобы скрыть биржевую ленту'],
    es:['Tu asistente de voz 🎙️ — arrástrala donde quieras','Toca aquí para ocultar la cinta bursátil'],
    ml:['നിങ്ങളുടെ വോയ്സ് അസിസ്റ്റന്റ് 🎙️ — എവിടേക്കും വലിക്കാം','സ്റ്റോക്ക് ടിക്കർ മറയ്ക്കാൻ ഇവിടെ അമർത്തുക']
  };
  const txt = T[L] || T.en;
  const isRTL = (L === 'ar' || L === 'ur');
  function markDone(){ try{ localStorage.setItem('introTourDone','1'); }catch(e){ __swallow(e, "save:app-08-maha#29"); } }

  function buildOverlay(){
    const ov = document.createElement('div');
    ov.id = 'introTourOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);opacity:0;transition:opacity .3s;';
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;border:3px solid #6b7280;border-radius:50%;box-shadow:0 0 18px 6px rgba(107,114,128,.7);pointer-events:none;transition:all .45s ease;';
    const bubble = document.createElement('div');
    bubble.dir = isRTL ? 'rtl' : 'ltr';
    bubble.style.cssText = 'position:fixed;max-width:230px;background:rgba(30,22,54,.97);color:#fff;font-size:14px;line-height:1.5;padding:10px 14px;border-radius:14px;border:1px solid rgba(107,114,128,.5);box-shadow:0 6px 24px rgba(0,0,0,.5);pointer-events:none;transition:all .45s ease;';
    if(!document.getElementById('introTourPulseCss')){
      const st = document.createElement('style');
      st.id = 'introTourPulseCss';
      st.textContent = '@keyframes introTourPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}#introTourOverlay div:first-child{animation:introTourPulse 1.1s ease-in-out infinite;}';
      document.head.appendChild(st);
    }
    ov.appendChild(ring); ov.appendChild(bubble);
    return { ov, ring, bubble };
  }

  function pointAt(ring, bubble, el, text){
    const r = el.getBoundingClientRect();
    const pad = 8;
    ring.style.width = (r.width + pad*2) + 'px';
    ring.style.height = (r.height + pad*2) + 'px';
    ring.style.left = (r.left - pad) + 'px';
    ring.style.top = (r.top - pad) + 'px';
    bubble.textContent = text;
    bubble.style.top = Math.min(window.innerHeight - 90, r.bottom + 14) + 'px';
    const centerX = r.left + r.width/2;
    let bl = centerX - 115;
    bl = Math.max(10, Math.min(bl, window.innerWidth - 240));
    bubble.style.left = bl + 'px';
  }

  function start(){
    const mahaBtn = document.getElementById('btnMaha');
    if(!mahaBtn || window.getComputedStyle(mahaBtn).display === 'none'){ markDone(); return; }
    const { ov, ring, bubble } = buildOverlay();
    document.body.appendChild(ov);
    requestAnimationFrame(() => { ov.style.opacity = '1'; });
    pointAt(ring, bubble, mahaBtn, txt[0]);
    let t2 = null, t3 = null;
    function dismiss(){
      markDone();
      if(t2) clearTimeout(t2);
      if(t3) clearTimeout(t3);
      ov.style.opacity = '0';
      setTimeout(() => { try{ ov.remove(); }catch(e){ __swallow(e, "ui:app-08-maha#30"); } }, 320);
    }
    ov.addEventListener('pointerdown', dismiss, { once:true });
    t2 = setTimeout(() => {
      const tick = document.getElementById('stockTickerToggle');
      const tickerBox = document.getElementById('stockTicker');
      if(tick && tickerBox && window.getComputedStyle(tickerBox).display !== 'none'){
        pointAt(ring, bubble, tick, txt[1]);
        // Demo: collapse & re-open the ticker twice, slowly, so the new
        // user sees exactly what the arrow does. Ends in the open state.
        [700, 1500, 2300, 3100].forEach(ms => {
          setTimeout(() => { try{ tick.click(); }catch(e){ __swallow(e, "misc:app-08-maha#31"); } }, ms);
        });
        t3 = setTimeout(dismiss, 3800);
      } else {
        dismiss();
      }
    }, 5000);
  }
  setTimeout(start, 1200);
})();

// Make the floating Maha launcher button draggable anywhere on screen.
// Position is remembered across sessions via localStorage. Uses the
// Pointer Events API so mouse, touch, and pen all work reliably and the
// button always follows the finger/cursor exactly (no getting "stuck").
(function mahaBtnDraggableSetup(){
  const btn = btnMahaEl;
  if(!btn) return;
  const STORAGE_KEY = 'mahaBtnPos';
  let dragging = false, moved = false, startX = 0, startY = 0, startLeft = 0, startTop = 0, activePointerId = null;

  function clamp(val, min, max){ return Math.min(Math.max(val, min), max); }

  // v204: minimum top so the icon can never sit on top of the header /
  // provider strip, regardless of a saved or freshly-computed position.
  function minTopAllowed(){
    let bottom = 0;
    const header = document.querySelector('header');
    if(header){
      const r = header.getBoundingClientRect();
      if(r.height > 0) bottom = Math.max(bottom, r.bottom);
    }
    const strip = document.getElementById('providerStripMobile');
    if(strip){
      const cs = window.getComputedStyle(strip);
      if(cs.display !== 'none'){
        const r = strip.getBoundingClientRect();
        if(r.height > 0) bottom = Math.max(bottom, r.bottom);
      }
    }
    return bottom + 8;
  }

  function applyPos(left, top){
    const w = btn.offsetWidth || 45, h = btn.offsetHeight || 45;
    const maxLeft = Math.max(4, window.innerWidth - w - 4);
    const maxTop = Math.max(4, window.innerHeight - h - 4);
    // v205: full drag freedom — allowed anywhere on screen, even over the header.
    left = clamp(left, 4, maxLeft);
    top = clamp(top, 4, maxTop);
    // Fully remove the logical "inset-inline-end" (used for the RTL default
    // position) and the physical "right" property instead of just setting
    // them to 'auto'. In Chrome, a logical inset property left in place
    // (even as 'auto') wins the cascade over an explicit physical "left",
    // which silently snapped the button's real horizontal position back to
    // its RTL-computed spot on every drag (this is why it only ever
    // appeared to move vertically). Removing the properties entirely avoids
    // the conflict so "left" fully controls the horizontal position.
    btn.style.removeProperty('right');
    btn.style.removeProperty('inset-inline-end');
    btn.style.removeProperty('bottom');
    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
    return { left, top };
  }

  function savePos(left, top){
    // v420: مها تتذكّر موضعها. يُحفظ ما يضعه المستخدم بيده فقط، والنقر المزدوج
    // يمحو الذاكرة ويعيدها إلى موضعها الافتراضي (resetToDefault).
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: Math.round(left), top: Math.round(top) }));
    }catch(e){ __swallow(e, "save:app-08-maha#32b"); }
  }

  function restorePos(){
    // v420: الافتراضي لم يتغيّر — منتصف الشاشة. الموضع المحفوظ يُقرأ إن وُجد،
    // ويمرّ على applyPos فيُقصّ داخل الشاشة الحالية (نافذة أصغر لا تُخفيها).
    const w = btn.offsetWidth || 45, h = btn.offsetHeight || 45;
    var saved = null;
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        var pos = JSON.parse(raw);
        if(pos && isFinite(pos.left) && isFinite(pos.top)) saved = pos;
      }
    }catch(e){ __swallow(e, "auth:app-08-maha#32"); }
    if(saved) applyPos(saved.left, saved.top);
    else applyPos((window.innerWidth - w) / 2, (window.innerHeight - h) / 2);
  }

  function resetToDefault(){
    try{ localStorage.removeItem(STORAGE_KEY); }catch(e){ __swallow(e, "misc:app-08-maha#33"); }
    // v202: الموضع الافتراضي = منتصف حافة الشاشة عموديًا (نفس الجهة المعتادة)،
    // بخاصية موضع منطقية واحدة حتى لا يحدث تعارض left/right.
    btn.style.removeProperty('left');
    btn.style.removeProperty('right');
    btn.style.removeProperty('bottom');
    btn.style.insetInlineEnd = '16px';
    btn.style.top = 'calc(50% - ' + Math.round((btn.offsetHeight || 45) / 2) + 'px)';
  }

  function onPointerDown(e){
    if(e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true; moved = false; activePointerId = e.pointerId;
    const rect = btn.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    startX = e.clientX; startY = e.clientY;
    btn.style.transition = 'none';
    btn.style.cursor = 'grabbing';
    try{ btn.setPointerCapture(e.pointerId); }catch(err){ __swallow(err, "ui:app-08-maha#34"); }
  }

  function onPointerMove(e){
    if(!dragging || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if(Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    if(moved) e.preventDefault();
    applyPos(startLeft + dx, startTop + dy);
  }

  function onPointerUp(e){
    if(!dragging || e.pointerId !== activePointerId) return;
    dragging = false;
    btn.style.transition = '';
    btn.style.cursor = 'grab';
    const rect = btn.getBoundingClientRect();
    const pos = applyPos(rect.left, rect.top);
    savePos(pos.left, pos.top);
    try{ btn.releasePointerCapture(e.pointerId); }catch(err){ __swallow(err, "ui:app-08-maha#35"); }
    activePointerId = null;
    if(moved){
      // Swallow the click that follows a drag so it doesn't start a call.
      const suppressClick = (ev) => { ev.stopPropagation(); ev.preventDefault(); btn.removeEventListener('click', suppressClick, true); };
      btn.addEventListener('click', suppressClick, true);
    }
  }

  btn.style.touchAction = 'none';
  btn.addEventListener('pointerdown', onPointerDown);
  btn.addEventListener('pointermove', onPointerMove);
  btn.addEventListener('pointerup', onPointerUp);
  btn.addEventListener('pointercancel', onPointerUp);
  // A real double-click/double-tap always resets the button to its default
  // corner, in case it ever ends up somewhere awkward. Uses the native
  // dblclick event (not manual timing) so it can never interfere with a
  // normal single drag gesture.
  btn.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); resetToDefault(); });
  window.addEventListener('resize', () => {
    const rect = btn.getBoundingClientRect();
    const pos = applyPos(rect.left, rect.top);
    savePos(pos.left, pos.top);
  });

  restorePos();
})();

// Tap the small generated-image thumbnail in Maha's call window to view it
// full-screen; tap anywhere on the overlay to close it again.
(function mahaImageLightboxSetup(){
  const thumb = document.getElementById('mahaGenImage');
  const lightbox = document.getElementById('mahaImageLightbox');
  const lightboxImg = document.getElementById('mahaImageLightboxImg');
  if(!thumb || !lightbox || !lightboxImg) return;
  thumb.addEventListener('click', () => {
    if(!thumb.src) return;
    lightboxImg.src = thumb.src;
    lightbox.style.display = 'flex';
  });
  lightbox.addEventListener('click', () => { lightbox.style.display = 'none'; });
})();
