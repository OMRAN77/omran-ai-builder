// 🎁 v343: رسائل ودّية بدل أكواد الأخطاء عند توليد/تعديل الصور — مع فتح
// نافذة إنشاء حساب تلقائيًا للضيف الذي استهلك صوره المجانية.
function imgErrFriendly(err, isAr){
  if(err === 'guest_image_used'){
    setTimeout(() => { try{ window.requireLogin && window.requireLogin('guestImage'); }catch(e){ __swallow(e, "auth:app-02-tts#1"); } }, 1500);
    return isAr
      ? '🎁 خلصت صورك المجانية الثلاث كضيف! أنشئ حسابًا مجانيًا خلال ثوانٍ وبتحصل على 70 نقطة هدية تكمل فيها توليد وتعديل الصور بلا توقف.'
      : '🎁 You have used your 3 free guest images! Create a free account in seconds and get 70 gift points to keep generating and editing images.';
  }
  if(err === 'points_insufficient'){
    return isAr
      ? '⚡ نقاطك الحالية ما تكفي لهذه الصورة (تحتاج 10 نقاط). افتح الإعدادات ← الباقات لشحن نقاطك وتكمل مباشرة.'
      : '⚡ Not enough points for this image (needs 10). Open Settings → Plans to top up and continue.';
  }
  return null;
}

// Detects the spoken-language BCP47 prefix from raw text so the speaker can
// pick a matching device voice / language tag. Order matters: check unique
// scripts first (Devanagari, Arabic), then fall back to Latin-script
// heuristics (French vs English) using accented letters + common words.
function detectSpeechLang(text){
  const t = String(text || '');
  if(/[\u0980-\u09FF]/.test(t)) return 'bn'; // Bengali script
  if(/[\u0900-\u097F]/.test(t)){
    // Devanagari script is shared by Hindi and Nepali; use common Nepali-only words as a hint.
    if(/\b(छ|छन्|हो|गर्नुहोस्|तपाईं|म्ल|पर्छ)\b/.test(t)) return 'ne';
    return 'hi'; // Devanagari default => Hindi
  }
  if(/[\u0600-\u06FF]/.test(t)){
    // Arabic-script text: Urdu uses extra letters not found in standard Arabic.
    if(/[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06C2\u06D2]/.test(t)) return 'ur';
    return 'ar';
  }
  const frenchHints = /[àâäæçéèêëîïôœùûüÿ]/i;
  const frenchWords = /\b(le|la|les|des|une|est|et|vous|nous|bonjour|merci|s'il|être|avec|pour|dans)\b/i;
  if(frenchHints.test(t) || frenchWords.test(t)) return 'fr';
  return 'en';
}
function pickVoice(langCode){
  const voices = ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() : [];
  if(!voices.length) return null;
  const preferredName = localStorage.getItem('aiapp_voice_name');
  if(preferredName){
    const exact = voices.find(v => v.name === preferredName);
    if(exact) return exact;
  }
  const code = (typeof langCode === 'string') ? langCode : (langCode ? 'ar' : 'en');
  const langVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(code));
  const pool = langVoices.length ? langVoices : voices;
  const genderPref = localStorage.getItem('aiapp_voice_gender');
  if(genderPref){
    const femaleHints = /female|woman|zira|susan|fiona|moira|samantha|victoria|karen|tessa|eva|salma|hoda|amira|layla|zeina/i;
    const maleHints = /male|man|daniel|david|fred|alex|mark|george|thomas|rishi|majed|naayf|hamed/i;
    const filtered = pool.filter(v => genderPref === 'female' ? femaleHints.test(v.name) : maleHints.test(v.name));
    if(filtered.length) return filtered[0];
  }
  return pool[0] || voices[0];
}
let currentCloudAudio = null;
let currentCloudToken = null;
let ttsHighlightRaf = null;
let ttsHighlightWordEls = null;
function clearWordHighlight(){
  if(ttsHighlightWordEls){
    ttsHighlightWordEls.forEach(el => { if(el) el.classList.remove('active'); });
  }
}
function setActiveWord(wordEls, idx){
  if(!wordEls) return;
  wordEls.forEach((el, i) => { if(el) el.classList.toggle('active', i === idx); });
}
// Splits text into words wrapped in <span class="tts-word"> so we can
// highlight the word currently being spoken. Whitespace/newlines between
// words are kept as plain text nodes so visual layout is unchanged.
// Builds one <span class="tts-word"> per whitespace-separated token (same
// tokenization as before, so word count/order still matches wordStartOffsets()
// and TTS karaoke highlighting stays in sync). On top of that, it now gives
// light visual treatment to simple Markdown the AI providers commonly emit:
// "## heading" lines get the '#' markers hidden + a heading class, and
// "**bold**" spans get their asterisks stripped + a bold class. This never
// changes which token maps to which span, only how that span looks.
function buildSpokenWordSpans(container, text){
  container.innerHTML = '';
  const wordEls = [];
  // v467: capture markdown links [text](url) — even with spaces — as a single token
  // v541: **[نص](رابط)** كان ينكسر لأن ** تسبق [ فتُقسَّم على المسافات
  const re = /[^\s\[!\x60]*(?:\*\*)?\[[^\]]*\]\(https?:\/\/[^\s)]+\)(?:\*\*)?[.,،؛!؟)]*|\S+/g;
  let m, lastIndex = 0;
  let boldOpen = false;
  let headerLevel = 0; // >0 while inside a "## ..." heading line
  let parent = container;    // where tokens/text currently get appended
  let codePre = null;        // non-null while inside a ``` fenced code block
  const openCodeBlock = (lang) => {
    const block = document.createElement('div');
    block.className = 'chat-codeblock';
    const head = document.createElement('div');
    head.className = 'chat-codeblock-head';
    const lbl = document.createElement('span');
    lbl.textContent = lang || 'code';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-codeblock-copy';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const pre = document.createElement('pre');
    btn.onclick = async (e) => {
      e.stopPropagation();
      const codeTxt = pre.textContent;
      try{ await navigator.clipboard.writeText(codeTxt); }
      catch(err){ const ta = document.createElement('textarea'); ta.value = codeTxt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      btn.innerHTML = '✅';
      setTimeout(() => { btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; }, 1500);
    };
    head.appendChild(lbl); head.appendChild(btn);
    block.appendChild(head); block.appendChild(pre);
    container.appendChild(block);
    codePre = pre; parent = pre;
  };
  const closeCodeBlock = () => { codePre = null; parent = container; };
  while((m = re.exec(text))){
    if(m.index > lastIndex){
      const between = text.slice(lastIndex, m.index);
      parent.appendChild(document.createTextNode(between));
      if(between.indexOf('\n') !== -1) headerLevel = 0;
    }
    if(/^```/.test(m[0])){
      // fence token: hide it, toggle code mode (span kept so TTS word mapping stays aligned)
      const fSpan = document.createElement('span');
      fSpan.className = 'tts-word';
      fSpan.style.display = 'none';
      container.appendChild(fSpan);
      wordEls.push(fSpan);
      if(codePre) closeCodeBlock(); else openCodeBlock(m[0].slice(3));
      lastIndex = m.index + m[0].length;
      continue;
    }
    if(codePre){
      const cSpan = document.createElement('span');
      cSpan.className = 'tts-word';
      cSpan.textContent = m[0];
      parent.appendChild(cSpan);
      wordEls.push(cSpan);
      lastIndex = m.index + m[0].length;
      continue;
    }
    const token = m[0];
    const span = document.createElement('span');
    span.className = 'tts-word';
    if(headerLevel === 0 && /^#{1,6}$/.test(token)){
      // Bare "#"/"##"/etc token starting a line: hide it, start heading mode.
      span.style.display = 'none';
      headerLevel = token.length;
    } else {
      const wasBold = boldOpen;
      let display = token;
      const markerCount = (token.match(/\*\*/g) || []).length;
      if(markerCount){
        display = token.split('**').join('');
        if(markerCount % 2 === 1) boldOpen = !boldOpen;
      }
      // 🔗 clickable links: markdown [text](url) or plain URLs
      // v467: الرابط المسبوق بقوس أو علامة اقتباس — (https://…) أو «https://…» —
      // كان يسقط من الالتقاط فيخرج نصًّا يُنسخ باليد. نفصل البادئة، ونوسّع
      // اللاحقة لتشمل : » " ' ] التي تلتصق بنهايات الروابط في النصّ العربي.
      let __lead = '';
      // v476: «[نص](رابط)» كان يبدأ بـ"[" فتقتطعه بادئةُ v467 فينكسر الماركداون
      // ويظهر «النص](الرابط)» ملتصقًا. نتخطّى الاقتطاع متى كان التوكن رابطَ ماركداون.
      const __isMd = /^\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(display);
      const __leadM = __isMd ? null : (display.match(/^([^\[!\x60]+)(?=\[[^\]]+\]\(https?:\/\/)/) || display.match(/^[(«"'\[]+(?=(?:\[|https?:\/\/|www\.))/));
      if(__leadM){ __lead = __leadM[0]; display = display.slice(__lead.length); }
      const linkM = display.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)([.,،؛:!؟)»"'\]]*)$/);
      const urlM = !linkM && display.match(/^(https?:\/\/[^\s<>"']{4,}|www\.[^\s<>"']{4,})([.,،؛:!؟)»"'\]]*)$/);
      if(linkM || urlM){
        if(__lead) span.appendChild(document.createTextNode(__lead));
        const rawUrl = linkM ? linkM[2] : urlM[1];
        const href = rawUrl.indexOf('www.') === 0 ? 'https://' + rawUrl : rawUrl;
        const a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = linkM ? linkM[1] : rawUrl;
        a.setAttribute('dir', 'auto'); // v476 bidi
        a.style.cssText = 'color:var(--accent2); text-decoration:underline; word-break:break-all; unicode-bidi:isolate;';
        span.appendChild(a);
        const trail = linkM ? linkM[3] : urlM[2];
        if(trail) span.appendChild(document.createTextNode(trail));
      } else {
        span.textContent = __lead + display;
      }
      if(wasBold || markerCount) span.classList.add('md-bold');
      if(headerLevel) span.classList.add('md-h' + headerLevel);
    }
    container.appendChild(span);
    wordEls.push(span);
    lastIndex = m.index + m[0].length;
  }
  if(lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
  // v476: عزل الاتجاه — «(+9714) 708 1111» داخل جملة عربية كان يُعرض معكوسًا
  // لأن المسافات بين الأرقام تتبع اتجاه الفقرة. نلفّ كل تتابع لاتيني/رقمي
  // متجاور في غلاف dir=ltr معزول. لا يغيّر عدد spans فمحاذاة TTS تبقى سليمة.
  try{
    const __RTL = /[\u0600-\u08ff\ufb50-\ufeff]/, __LTR = /[0-9A-Za-z]/;
    const __GLUE = /^[\s\u00a0()\[\]{}.,:;+\-\/\\#*'"]*$/;
    let __run = [];
    const __flush = () => {
      if(__run.length > 2){
        const w = document.createElement('span');
        w.setAttribute('dir', 'ltr');
        w.style.unicodeBidi = 'isolate';
        container.insertBefore(w, __run[0]);
        __run.forEach(n => w.appendChild(n));
      }
      __run = [];
    };
    for(const n of Array.from(container.childNodes)){
      const t = n.textContent || '';
      if(__RTL.test(t) || (n.nodeType === 1 && n.className === 'chat-codeblock')) __flush();
      else if(__LTR.test(t) || (__run.length && __GLUE.test(t))) __run.push(n);
      else __flush();
    }
    __flush();
  }catch(e){ __swallow(e, 'bidi:isolate'); }
  return wordEls;
}
function wordStartOffsets(text){
  const offsets = [];
  const re = /\S+/g;
  let m;
  while((m = re.exec(text))) offsets.push(m.index);
  return offsets;
}
function stopAllSpeaking(){
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  if(currentCloudAudio){ try{ currentCloudAudio.pause(); }catch(e){ __swallow(e, "misc:app-02-tts#2"); } currentCloudAudio = null; }
  if(ttsHighlightRaf){ cancelAnimationFrame(ttsHighlightRaf); ttsHighlightRaf = null; }
  clearWordHighlight();
  ttsHighlightWordEls = null;
}
async function fetchCloudSpeech(text){
  // v246: دائمًا صوت Azure Neural عالي الجودة (نفس مسار مها) — الجنس من إعداد
  // المستخدم واللغة تُكتشف تلقائيًا من النص لدقة نطق أعلى في كل اللغات.
  const gender = localStorage.getItem('aiapp_voice_gender') || 'female';
  const detected = detectSpeechLang(String(text));
  const resp = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice: 'maha', gender, lang: detected, text: String(text).slice(0, 4000) })
  });
  if(!resp.ok){
    let msg = 'cloud-tts-failed:' + resp.status;
    try{ const j = await resp.json(); if(j && j.error) msg = j.error; }catch(e){ __swallow(e, "misc:app-02-tts#3"); }
    throw new Error(msg);
  }
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}
// Splits text into speakable chunks (roughly one sentence each, merged up to
// ~180 chars) so cloud TTS can start playing the first chunk almost
// immediately instead of waiting for the entire message to be synthesized.
// Each chunk also carries wordStart/wordCount so karaoke highlighting can map
// back to the correct spans in the full wordEls array.
function splitTextForTTS(text){
  const wordRe = /\S+/g;
  const words = [];
  let m;
  while((m = wordRe.exec(text))) words.push({ text: m[0], index: m.index });
  if(!words.length) return [];
  const chunks = [];
  let startWord = 0;
  let buf = '';
  for(let i = 0; i < words.length; i++){
    buf += (buf ? ' ' : '') + words[i].text;
    const endsSentence = /[.!?؟۔]$/.test(words[i].text);
    const isLast = i === words.length - 1;
    if(isLast || (endsSentence && buf.length >= 20) || buf.length >= 180){
      chunks.push({ text: buf, wordStart: startWord, wordCount: i - startWord + 1 });
      buf = '';
      startWord = i + 1;
    }
  }
  return chunks;
}
// Unified speak function: uses OpenAI cloud voice if enabled+key present, else falls back to device voice.
// wordEls (optional): array of <span class="tts-word"> elements (in order) matching the words
// in `text`, built via buildSpokenWordSpans(). If provided, the currently-spoken word is
// highlighted live as playback progresses (karaoke-style).
// Prototype: rewrites text into a colloquial Arabic dialect (Gulf/Egyptian)
// using the site's own AI before it's spoken aloud. Only triggers when the
// user picked a dialect in Settings and the text looks like Arabic. Falls
// back silently to the original text if the AI call fails for any reason.
async function applyDialectForSpeech(text){
  // v248: ميزة اللهجة التجريبية أُزيلت نهائيًا — النص يُقرأ كما هو مباشرة
  // (الإعداد القديم المحفوظ في أجهزة المستخدمين كان يعلّق القراءة بطلب AI إضافي).
  return text;
  const dialect = localStorage.getItem('aiapp_voice_dialect') || '';
  if(!dialect) return text;
  if(!/[\u0600-\u06FF]/.test(text)) return text; // only convert Arabic text
  try{
    const dialectName = dialect === 'gulf' ? 'اللهجة الخليجية' : 'اللهجة المصرية';
    const prompt = `أعد صياغة النص التالي بالكامل باللغة العربية العامية (${dialectName}) بنفس المعنى تمامًا، بدون أي إضافات أو شرح، وأعطني النص المعاد صياغته فقط بدون مقدمات:\n\n${text}`;
    const reply = await callAI([{ role: 'user', content: prompt }]);
    const converted = (reply ? String(reply).trim() : '');
    return converted || text;
  }catch(e){
    console.error('dialect conversion failed', e);
    return text;
  }
}
// v265: عنصر صوت واحد يُفتح (unlock) لحظة ضغطة المستخدم ثم يُعاد استخدامه —
// آيفون وبعض المتصفحات تمنع تشغيل صوت أُنشئ بعد جلب من الشبكة خارج الضغطة.
let cloudAudioEl = null;
function unlockCloudAudio(){
  try{
    if(!cloudAudioEl) cloudAudioEl = new Audio();
    // wav صامت قصير جدًا — تشغيله داخل الضغطة "يفتح" العنصر للتشغيل لاحقًا
    cloudAudioEl.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    const p = cloudAudioEl.play();
    if(p && p.catch) p.catch(()=>{});
  }catch(e){ __swallow(e, "misc:app-02-tts#4"); }
}
async function speakSmart(text, onStart, onEnd, verbose, wordEls){
  if(!text) return;
  unlockCloudAudio(); // يجب أن يحدث قبل أي await حتى يبقى ضمن ضغطة المستخدم
  text = await applyDialectForSpeech(text);
  stopAllSpeaking();
  ttsHighlightWordEls = wordEls || null;
  // v248: صوت السحابة (Azure) دائمًا — الخيار القديم المحفوظ 'false' في أجهزة
  // بعض المستخدمين كان يحوّلهم لصوت الجهاز المعطّل.
  const cloudEnabled = true;
  const detectedLangForCloud = detectSpeechLang(text);
  const noDeviceTTS = !('speechSynthesis' in window);
  const noMatchingVoice = !noDeviceTTS && !pickVoice(detectedLangForCloud);
  // Cloud voice (server-side, works on any device/browser) is used when the
  // user explicitly enabled it, OR automatically as a fallback when the
  // device has no speech synthesis at all, or no matching voice installed
  // for the detected language (Arabic/French/Hindi/Urdu/English).
  const useCloud = cloudEnabled || noDeviceTTS || noMatchingVoice;
  if(useCloud){
    try{
      const chunks = splitTextForTTS(text);
      if(!chunks.length) throw new Error('empty-text');
      const token = {}; // unique per-call token; stopAllSpeaking invalidates it
      currentCloudToken = token;
      // Prefetch pipeline: kick off the fetch for a chunk as soon as we start
      // playing the previous one, so network latency for chunk N+1 overlaps
      // with playback time of chunk N instead of adding up sequentially.
      const promises = new Array(chunks.length);
      const ensureFetched = (i) => {
        if(i < chunks.length && !promises[i]) promises[i] = fetchCloudSpeech(chunks[i].text);
        return promises[i];
      };
      ensureFetched(0);
      let started = false;
      const playChunk = async (i) => {
        if(currentCloudToken !== token) return; // stopped/superseded
        if(i >= chunks.length){
          currentCloudAudio = null;
          if(ttsHighlightRaf){ cancelAnimationFrame(ttsHighlightRaf); ttsHighlightRaf = null; }
          clearWordHighlight();
          if(onEnd) onEnd();
          return;
        }
        let url;
        try{ url = await ensureFetched(i); }
        catch(e){
          if(currentCloudToken !== token) return;
          // Skip the failed chunk rather than aborting the whole reply.
          playChunk(i + 1);
          return;
        }
        if(currentCloudToken !== token) return;
        ensureFetched(i + 1); // prefetch next chunk while this one plays
        // v265: نعيد استخدام العنصر المفتوح بدل إنشاء Audio جديد كل مرة —
        // العنصر الجديد يُمنع تشغيله على آيفون لأنه خارج ضغطة المستخدم.
        const audio = cloudAudioEl || new Audio();
        cloudAudioEl = audio;
        try{ audio.pause(); }catch(e){ __swallow(e, "misc:app-02-tts#5"); }
        audio.src = url;
        currentCloudAudio = audio;
        if(!started){ started = true; if(onStart) onStart(); }
        audio.onended = () => { if(currentCloudToken === token) playChunk(i + 1); };
        audio.onerror = () => { if(currentCloudToken === token) playChunk(i + 1); };
        if(wordEls && wordEls.length){
          const chunkWordEls = wordEls.slice(chunks[i].wordStart, chunks[i].wordStart + chunks[i].wordCount);
          audio.addEventListener('loadedmetadata', () => {
            if(currentCloudToken !== token) return;
            const duration = audio.duration;
            if(!isFinite(duration) || duration <= 0) return;
            const lens = chunkWordEls.map(el => (el.textContent || '').length + 1);
            const totalChars = lens.reduce((a,b) => a + b, 0) || 1;
            let acc = 0;
            const starts = lens.map(len => { const s = (acc / totalChars) * duration; acc += len; return s; });
            const tick = () => {
              if(currentCloudToken !== token || !currentCloudAudio || audio.paused || audio.ended) return;
              const cur = audio.currentTime;
              let idx = 0;
              for(let k = 0; k < starts.length; k++){ if(starts[k] <= cur) idx = k; else break; }
              setActiveWord(wordEls, chunks[i].wordStart + idx);
              ttsHighlightRaf = requestAnimationFrame(tick);
            };
            ttsHighlightRaf = requestAnimationFrame(tick);
          }, { once: true });
        }
        await audio.play();
      };
      await playChunk(0);
      return;
    }catch(e){
      console.warn('Cloud voice failed, falling back to device voice:', e);
      if(verbose){
        alert((lang === 'ar' ? 'فشل الصوت الاصطناعي: ' : 'AI voice failed: ') + (e && e.message ? e.message : e));
      }
    }
  }
  if(!('speechSynthesis' in window)){ if(onEnd) onEnd(); return; }
  const detectedLang = detectSpeechLang(text);
  const langTags = { ar: 'ar-SA', ur: 'ur-PK', hi: 'hi-IN', fr: 'fr-FR', en: 'en-US' };
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = langTags[detectedLang] || 'en-US';
  const v = pickVoice(detectedLang);
  if(v) utter.voice = v;
  const offsets = wordEls && wordEls.length ? wordStartOffsets(text) : null;
  if(offsets){
    utter.onboundary = (e) => {
      if(e.name && e.name !== 'word') return;
      let idx = 0;
      for(let i = 0; i < offsets.length; i++){ if(offsets[i] <= e.charIndex) idx = i; else break; }
      setActiveWord(wordEls, idx);
    };
  }
  utter.onend = () => { clearWordHighlight(); if(onEnd) onEnd(); };
  utter.onerror = () => { clearWordHighlight(); if(onEnd) onEnd(); };
  if(onStart) onStart();
  window.speechSynthesis.speak(utter);
}
function speakText(text){ speakSmart(text); }
// Known Arabic TTS voice names -> Latin transliteration (accurate, curated)
const ARABIC_VOICE_NAME_MAP = {
  'منى':'Mona', 'حمدان':'Hamdan', 'نايف':'Naayf', 'سلمى':'Salma', 'هدى':'Hoda',
  'أميرة':'Amira', 'اميرة':'Amira', 'ليلى':'Layla', 'زينة':'Zeina', 'ماجد':'Majed',
  'حامد':'Hamed', 'زارية':'Zariyah', 'رشا':'Rasha', 'مريم':'Mariam', 'سارة':'Sara',
  'شاكر':'Shakir', 'فاطمة':'Fatima', 'ياسمين':'Yasmin', 'نور':'Noor', 'أحمد':'Ahmad',
  'احمد':'Ahmad', 'خالد':'Khalid', 'عبدالله':'Abdullah', 'سلطان':'Sultan', 'تيم':'Tim'
};
// Generic Arabic-script -> Latin fallback (approximate phonetic transliteration)
const ARABIC_LATIN_LETTERS = {
  'ا':'a','أ':'a','إ':'i','آ':'aa','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
  'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
  'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
  'ي':'y','ى':'a','ة':'a','ء':'', 'ئ':'e','ؤ':'o',
  'َ':'','ً':'','ُ':'','ٌ':'','ِ':'','ٍ':'','ّ':'','ْ':''
};
function transliterateArabicName(name){
  if(!/[\u0600-\u06FF]/.test(name)) return name;
  // Replace whole known words first (longest match), keep surrounding text intact
  let out = name;
  Object.keys(ARABIC_VOICE_NAME_MAP).sort((a,b)=>b.length-a.length).forEach(ar => {
    if(out.includes(ar)) out = out.split(ar).join(ARABIC_VOICE_NAME_MAP[ar]);
  });
  if(/[\u0600-\u06FF]/.test(out)){
    out = out.split('').map(ch => ARABIC_LATIN_LETTERS.hasOwnProperty(ch) ? ARABIC_LATIN_LETTERS[ch] : ch).join('');
    out = out.replace(/\s+/g,' ').trim();
    if(out) out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}
function populateVoicePicker(){
  const sel = $('#voiceNamePick');
  if(!sel || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const current = localStorage.getItem('aiapp_voice_name') || '';
  const uiLang = (typeof lang !== 'undefined' && lang) ? lang : (localStorage.getItem('aiapp_lang') || 'ar');
  sel.innerHTML = '<option value="">' + t('voiceAutoOption') + '</option>' +
    voices.map(v => {
      const label = (uiLang === 'ar') ? v.name : transliterateArabicName(v.name);
      return `<option value="${v.name.replace(/"/g,'&quot;')}">${label} (${v.lang})</option>`;
    }).join('');
  sel.value = voices.some(v => v.name === current) ? current : '';
}
if('speechSynthesis' in window){
  window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', populateVoicePicker);
}
const messagesEl = $('#messages');

// v463: سكرول طبيعي — المحادثة تتحرك كلها مع بعض
function anchorLastUserMsgTop(){
  try{ messagesEl.scrollTop = messagesEl.scrollHeight; syncChatJumpButton(); }catch(e){ window.__swallow && window.__swallow(e,'ui.scrollAnchor'); }
}
// رتم البث: نأخذ قرار المتابعة قبل أن يكبر الرد. القياس بعد إضافة النص
// كان يظن أن المستخدم صعد للأعلى، فيتوقف التمرير وحده وسط الرد الطويل.
function chatIsNearBottom(threshold){
  try{
    const gap = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    return gap < (threshold == null ? 160 : threshold);
  }catch(e){ return true; }
}
function syncChatJumpButton(){
  try{
    const btn = $('#chatJumpBottom');
    if(!btn) return;
    btn.classList.toggle('visible', !chatIsNearBottom());
  }catch(e){ __swallow(e, "misc:app-02-tts#7"); }
}
function smartScrollBottom(wasNearBottom){
  try{
    const follow = (typeof wasNearBottom === 'boolean') ? wasNearBottom : chatIsNearBottom();
    if(follow) messagesEl.scrollTop = messagesEl.scrollHeight;
    syncChatJumpButton();
  }catch(e){ __swallow(e, "misc:app-02-tts#8"); }
}
const chatJumpBottomBtn = $('#chatJumpBottom');
if(messagesEl){
  messagesEl.addEventListener('scroll', syncChatJumpButton, {passive:true});
}
if(chatJumpBottomBtn){
  chatJumpBottomBtn.onclick = () => {
    messagesEl.scrollTo ? messagesEl.scrollTo({top:messagesEl.scrollHeight, behavior:'smooth'}) : (messagesEl.scrollTop = messagesEl.scrollHeight);
    setTimeout(syncChatJumpButton, 220);
  };
}

// أثناء البث نخفي علامات Markdown الناقصة وننسّق المكتمل فورًا؛ عند اكتمال
// الرابط يعود نصّه نفسه كرابط قابل للنقر بدل القفزة من نص خام إلى تنسيق نهائي.
function streamingMarkdownDisplayText(text){
  return String(text || '')
    .replace(/\*{0,2}\[([^\]\n]+)\]\((?:https?:\/\/)?[^\s)\n]*$/g, '$1')
    .replace(/\*{0,2}\[([^\]\n]+)\]$/g, '$1')
    .replace(/\*{0,2}\[([^\]\n]*)$/g, '$1');
}
function renderStreamingAssistant(el, text){
  if(!el) return;
  el.classList.add('msg-streaming');
  buildSpokenWordSpans(el, streamingMarkdownDisplayText(text));
}

