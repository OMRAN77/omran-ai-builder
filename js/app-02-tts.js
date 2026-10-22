// 🎁 v343: رسائل ودّية بدل أكواد الأخطاء عند توليد/تعديل الصور — مع فتح
// نافذة إنشاء حساب تلقائيًا للضيف الذي استهلك صوره المجانية.
function imgErrFriendly(err, isAr, info){
  if(err === 'guest_image_used'){
    setTimeout(() => { try{ window.requireLogin && window.requireLogin('guestImage'); }catch(e){ __swallow(e, "auth:app-02-tts#1"); } }, 1500);
    return isAr
      ? '🎁 خلصت صورك المجانية الثلاث كضيف! أنشئ حسابًا مجانيًا خلال ثوانٍ وبتحصل على 70 نقطة هدية تكمل فيها توليد وتعديل الصور بلا توقف.'
      : '🎁 You have used your 3 free guest images! Create a free account in seconds and get 70 gift points to keep generating and editing images.';
  }
  if(err === 'points_insufficient'){
    /* v-plans-real-balance (تدقيق ١٨ أكتوبر: «تقول تحتاج 10 نقاط والرصيد 10 والصورة أصلًا بـ20»): الرقم كان مكتوبًا هنا من سعر قديم.
       الآن رصيده وسعر الصورة من ردّ الخادم نفسه (402: points · needed)، وبلاهما بلا رقم. */
    const have = info && Number(info.points), need = info && Number(info.needed);
    if(info && isFinite(have) && isFinite(need) && need > 0){
      return isAr
        ? '⚡ رصيدك ' + have + ' نقطة، وهذه الصورة تحتاج ' + need + ' نقطة. افتح الإعدادات ← الباقات لشحن نقاطك وتكمل مباشرة.'
        : '⚡ You have ' + have + ' points; this image needs ' + need + '. Open Settings → Plans to top up and continue.';
    }
    return isAr
      ? '⚡ نقاطك الحالية ما تكفي لهذه الصورة. افتح الإعدادات ← الباقات لشحن نقاطك وتكمل مباشرة.'
      : '⚡ Not enough points for this image. Open Settings → Plans to top up and continue.';
  }
  /* v-credit-out (أمر المالك ٢١ أكتوبر): رصيد مزوّد الصور نفد أو عطب عندنا — «الخدمة متوقّفة مؤقّتًا» بلغة الواجهة، والخادم ردّ النقاط
     (كان «مشغولة الآن، أعد المحاولة» فيعيد المستخدم ويُخصم ويُردّ مرّة بعد مرّة) */
  if(err === 'unavailable') return t('svcPaused');
  /* v-rest-fixes: سقف الصور في الساعة كان يصل رمزًا خامًّا «image_hourly_limit» — النصّ بالـ14 لغة بالحدّ والدقائق الباقية من ردّ الخادم */
  if(err === 'image_hourly_limit'){
    const m = Math.max(1, Math.ceil((Number(info && info.retryAfter) || 3600) / 60));
    return t('imgHourlyLimit').replace('{max}', String((info && info.max) || 20)).replace('{m}', String(m));
  }
  if(err === 'image_generation_timeout'){
    return isAr
      ? 'تأخر إنشاء الصورة هذه المرة. أعد المحاولة بعد لحظة.'
      : 'Image generation took too long this time. Please try again in a moment.';
  }
  if(err === 'image_generation_busy'){
    return isAr
      ? 'خدمة الصور مشغولة الآن. أعد المحاولة بعد لحظة.'
      : 'Image generation is busy right now. Please try again in a moment.';
  }
  if(err === 'image_generation_failed'){
    return isAr
      ? 'تعذّر إنشاء الصورة هذه المرة. جرّب مرة أخرى.'
      : 'The image could not be generated this time. Please try again.';
  }
  if(err === 'image_edit_style_mismatch'){
    return isAr
      ? 'أوقفت النتيجة لأنها غيّرت الصورة إلى أسلوب مختلف. أعد المحاولة وسيبقى الأصل كما هو.'
      : 'I stopped the result because it changed the image style. Try again; the original remains unchanged.';
  }
  if(err === 'image_edit_identity_mismatch'){
    return isAr
      ? 'أوقفت النتيجة لأنها غيّرت هوية الشخص أو أشياء لم تطلبها. بقيت الصورة الأصلية محفوظة.'
      : 'I stopped the result because it changed the person or unrelated details. The original remains saved.';
  }
  /* v-edit-no-change: الناتج رجع مطابقًا للأصل (التعديل لم يُطبَّق) — بعد محاولتين */
  if(err === 'image_edit_no_change'){
    return isAr
      ? 'النتيجة رجعت مطابقة لصورتك بلا أيّ تعديل، فلم أعرضها. جرّب مرّة أخرى أو اختر خيارًا آخر، ويفضّل صورة تظهر فيها المنطقة المطلوبة بوضوح.'
      : 'The result came back identical to your photo with no edit applied, so I did not show it. Try again or pick another option — a photo that clearly shows the area works best.';
  }
  /* v-img-honest: الخادم قاس الناتج فوجده الصورة نفسها (حتّى بعد المحرّك الآخر) فلم يعرضه وردّ النقاط — بدل «تمّ» على صورة لم تتغيّر */
  if(err === 'image_unchanged'){
    return t('imgUnchanged');
  }
  if(err === 'image_edit_validation_failed'){
    return isAr
      ? 'تعذّر التحقق من سلامة التعديل، لذلك لم أعرض النتيجة ولم أغيّر الأصل. جرّب بعد لحظة.'
      : 'The edit could not be verified, so I did not show it or replace the original. Try again shortly.';
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
/* v-tts-free: صوت الجهاز هو الاحتياط المجّانيّ حين لا يصل صوت الخادم — فنختار أفضله: الطبيعيّ أوّلًا (Natural/Neural
   في متصفّح Edge وهي أصوات الخادم نفسها، ثمّ Premium/Enhanced في آبل، ثمّ أصوات الشبكة)، والخليجيّ (ar-AE ثمّ ar-SA)
   قبل بقيّة العربيّ. الترتيب ثابت فالأجهزة بلا صوت طبيعيّ تبقى على اختيارها القديم. */
function deviceVoiceScore(v){
  const n = String((v && v.name) || '');
  const l = String((v && v.lang) || '').toLowerCase().replace('_', '-');
  let s = 0;
  if(/natural|neural/i.test(n)) s = 30;
  else if(/premium|enhanced|siri/i.test(n)) s = 20;
  else if(/google/i.test(n) || (v && v.localService === false)) s = 10;
  if(l.indexOf('ar-ae') === 0) s += 2;
  else if(l.indexOf('ar-sa') === 0) s += 1;
  return s;
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
  const pool = (langVoices.length ? langVoices : voices).slice().sort((a, b) => deviceVoiceScore(b) - deviceVoiceScore(a));
  const genderPref = localStorage.getItem('aiapp_voice_gender');
  if(genderPref){
    const femaleHints = /female|woman|zira|susan|fiona|moira|samantha|victoria|karen|tessa|eva|salma|hoda|amira|layla|zeina|fatima|zariyah|noura|\bamal\b|laila|aysha|\bsana\b|amany|\brana\b|maryam|mariam|\biman\b|mouna|\breem\b|amina/i;
    const maleHints = /\bmale\b|\bman\b|daniel|david|fred|alex|mark|george|thomas|rishi|majed|maged|naayf|hamed|hamid|hamdan|shakir|fahed|moaz|\bali\b|abdullah|taim|rami|laith|bassel|saleh|omar|jamal|hedi|ismael|tarik/i;
    // «Female» كانت تطابق «male» فيأخذ من اختار صوت رجل صوتَ امرأة
    const filtered = pool.filter(v => genderPref === 'female' ? femaleHints.test(v.name) : (maleHints.test(v.name) && !femaleHints.test(v.name)));
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
/* v-md-table (لقطة المالك: صف جدول ظهر بعلامات | خامًا فوق الرد): راسم الفقاعة
   يقطّع الكلمات للقراءة الصوتية ولا يفهم جداول الماركداون. الجدول يتحوّل إلى
   سطور مرتبة تناسب عرض الجوال: صف العناوين سطر بارز، وكل صف نقطة أول خليتها
   بارزة وبقية الخلايا بعد «—». يعمل في البث وفي الرد النهائي معًا. */
function mdTablesToLines(text){
  const lines = String(text || '').split('\n');
  const out = [];
  const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
  for(let i = 0; i < lines.length; i++){
    const l = lines[i];
    if(/^\s*\|.*\|\s*$/.test(l)){
      if(isSep(l)) continue;
      const cells = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      while(cells.length && cells[cells.length - 1] === '') cells.pop();
      if(!cells.length) continue;
      if(isSep(lines[i + 1])){ out.push('**' + cells.map(c => c.replace(/\*\*/g, '')).join(' · ') + '**'); continue; }
      const first = cells[0].replace(/\*\*/g, '');
      const rest = cells.slice(1).filter(Boolean);
      out.push('• **' + first + '**' + (rest.length ? ' — ' + rest.join(' — ') : ''));
      continue;
    }
    out.push(l);
  }
  return out.join('\n');
}
/* v-chat-math (لقطة المالك ٢٧ سبتمبر «حل سوال 28»): النموذج يكتب المعادلات بصيغة LaTeX
   ($\text{Be}$، $1s^2, 2s^2$، $$\cdot \text{Be} \cdot$$) وراسم الفقاعة لا يعرفها، فظهرت خامًا وقلب اتّجاهُ
   السطر العربيّ رموزَها المحايدة («($text{Be}\$)»). الآن تُلتقط المعادلة قبل التقطيع وتُستبدل برمز حارس بلا
   مسافات، ثمّ تُرسم عنصرًا معزول الاتّجاه: الأسس والأدلّة بحروف يونيكود حين تتوفّر (Be₃Al₂(SiO₃)₆، 1s²، 10⁻³)
   فتبقى صحيحة في المشاركة والنسخ، و<sup>/<sub> لما سواها (ومعهما ^( ) مخفيّة بصريًّا للمشاركة). كلمات المعادلة
   الزائدة تبقى عناصر tts-word مخفيّة فيبقى تمييز القراءة الصوتيّة متزامنًا. لا يُلمس: الكود (```…``` و`…`)
   والروابط، والأسعار ($5 و$10، 10$/شهر، ($$$)، Revenue ($)، A$ 7)، و${a}/$(pwd)/$$ الـPID/SQL، وregex.
   بلا مكتبة، وبلا lookbehind في أيّ regex (يُسقط الحزمة كلّها على سفاري قديم). */
const OMRAN_MATH_SYM = {
  times:'×', cdot:'·', cdotp:'·', div:'÷', pm:'±', mp:'∓', ast:'∗', star:'⋆', circ:'∘', bullet:'•', lt:'<', gt:'>', colon:':',
  leq:'≤', le:'≤', leqslant:'≤', leqq:'≦', geq:'≥', ge:'≥', geqslant:'≥', geqq:'≧', neq:'≠', ne:'≠', approx:'≈', approxeq:'≊', equiv:'≡',
  sim:'∼', simeq:'≃', cong:'≅', propto:'∝', ll:'≪', gg:'≫', lesssim:'≲', gtrsim:'≳', prec:'≺', succ:'≻', preceq:'⪯', succeq:'⪰',
  doteq:'≐', triangleq:'≜', coloneqq:'≔', models:'⊨', vdash:'⊢',
  infty:'∞', partial:'∂', nabla:'∇', hbar:'ℏ', ell:'ℓ', prime:'′', degree:'°', textdegree:'°', angle:'∠', measuredangle:'∡', perp:'⊥',
  parallel:'∥', nparallel:'∦', triangle:'△', sqrt:'√', surd:'√', Re:'ℜ', Im:'ℑ', aleph:'ℵ', wp:'℘', top:'⊤', bot:'⊥', AA:'Å', aa:'å',
  dagger:'†', ddagger:'‡', checkmark:'✓', square:'□', blacksquare:'■', backslash:'\\',
  sum:'∑', prod:'∏', coprod:'∐', int:'∫', iint:'∬', iiint:'∭', oint:'∮', bigcup:'⋃', bigcap:'⋂', bigoplus:'⨁', bigotimes:'⨂', bigvee:'⋁', bigwedge:'⋀',
  to:'→', rightarrow:'→', longrightarrow:'⟶', leftarrow:'←', longleftarrow:'⟵', gets:'←', leftrightarrow:'↔', longleftrightarrow:'⟷',
  Rightarrow:'⇒', Longrightarrow:'⟹', Leftarrow:'⇐', Longleftarrow:'⟸', Leftrightarrow:'⇔', Longleftrightarrow:'⟺', iff:'⇔', implies:'⇒',
  rightleftharpoons:'⇌', leftrightharpoons:'⇋', rightleftarrows:'⇄', hookrightarrow:'↪', uparrow:'↑', downarrow:'↓', updownarrow:'↕',
  Uparrow:'⇑', Downarrow:'⇓', nearrow:'↗', searrow:'↘', nwarrow:'↖', swarrow:'↙', mapsto:'↦',
  in:'∈', notin:'∉', ni:'∋', subset:'⊂', subseteq:'⊆', nsubseteq:'⊈', supset:'⊃', supseteq:'⊇', cup:'∪', cap:'∩', emptyset:'∅', varnothing:'∅',
  setminus:'∖', forall:'∀', exists:'∃', nexists:'∄', neg:'¬', lnot:'¬', land:'∧', wedge:'∧', lor:'∨', vee:'∨', oplus:'⊕', otimes:'⊗',
  therefore:'∴', because:'∵', nmid:'∤',
  ldots:'…', cdots:'⋯', dots:'…', vdots:'⋮', ddots:'⋱',
  lvert:'|', rvert:'|', vert:'|', mid:'|', lVert:'‖', rVert:'‖', Vert:'‖', langle:'⟨', rangle:'⟩', lfloor:'⌊', rfloor:'⌋', lceil:'⌈', rceil:'⌉',
  lbrace:'\uE011', rbrace:'\uE012',
  alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', varepsilon:'ε', zeta:'ζ', eta:'η', theta:'θ', vartheta:'ϑ', iota:'ι', kappa:'κ',
  lambda:'λ', mu:'μ', nu:'ν', xi:'ξ', omicron:'ο', pi:'π', varpi:'ϖ', rho:'ρ', varrho:'ϱ', sigma:'σ', varsigma:'ς', tau:'τ', upsilon:'υ',
  phi:'φ', varphi:'φ', chi:'χ', psi:'ψ', omega:'ω',
  Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π', Sigma:'Σ', Upsilon:'Υ', Phi:'Φ', Psi:'Ψ', Omega:'Ω',
  quad:' ', qquad:'  ', space:' '
};
const OMRAN_MATH_ORD = /^[α-ωΑ-Ωϑϖϱℏℓ∂∇∞′]$/; // رموز «عاديّة» تلتصق بما بعدها كالمتغيّر (ΔH، πr²، μm)
// معاملات وعلاقات وأسهم: بمسافة على جانبيها كما يرسمها LaTeX (kJ · mol⁻¹، 2 × 10³)
const OMRAN_MATH_BIN = '×·÷±∓∗⋆∘<>≤≦≥≧≠≈≊≡∼≃≅∝≪≫≲≳≺≻⪯⪰≐≜≔⊨⊢→⟶←⟵↔⟷⇒⟹⇐⟸⇔⟺⇌⇋⇄↪↦∈∉∋⊂⊆⊈⊃⊇∪∩∖∧∨⊕⊗';
const OMRAN_MATH_FUNC = /^(?:sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|lg|exp|lim|max|min|sup|inf|det|gcd|deg|arg)$/;
const OMRAN_MATH_SUP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','−':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ'};
const OMRAN_MATH_SUB = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','−':'₋','=':'₌','(':'₍',')':'₎'};
const OMRAN_MATH_VULGAR = {'1/2':'½','1/3':'⅓','2/3':'⅔','1/4':'¼','3/4':'¾','1/5':'⅕','2/5':'⅖','3/5':'⅗','4/5':'⅘','1/6':'⅙','5/6':'⅚','1/7':'⅐','1/8':'⅛','3/8':'⅜','5/8':'⅝','7/8':'⅞','1/9':'⅑','1/10':'⅒'};
const OMRAN_MATH_MIRROR = {'→':'←', '←':'→', '⟶':'⟵', '⟵':'⟶', '⇒':'⇐', '⇐':'⇒', '⟹':'⟸', '⟸':'⟹', '⇌':'⇋', '⇋':'⇌', '↦':'↤', '↤':'↦'};
const OMRAN_MATH_XARROW = { rightarrow:'→', leftarrow:'←', rightleftharpoons:'⇌', leftrightarrow:'↔', Rightarrow:'⇒', Leftarrow:'⇐' };
const OMRAN_MATH_AR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
// حروف وأرقام عربيّة فقط بلا الترقيم (، ؛ ؟) — كـ__RTL في عزل الاتّجاه
const OMRAN_MATH_ARL = /[\u0620-\u065F\u0660-\u0669\u066E-\u06D3\u06D5\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const OMRAN_MATH_DS = {R:'ℝ', N:'ℕ', Z:'ℤ', Q:'ℚ', C:'ℂ', P:'ℙ', H:'ℍ'};
const OMRAN_MATH_ACC = {vec:'\u20D7', overrightarrow:'\u20D7', hat:'\u0302', widehat:'\u0302', bar:'\u0305', overline:'\u0305', tilde:'\u0303', widetilde:'\u0303', dot:'\u0307', ddot:'\u0308', mathring:'\u030A'};
/* الالتقاط: البدائل الأولى محميّة تبقى كما هي (كتلة كود ولو مفتوحة أثناء البثّ، كود مضمَّن، رابط ماركداون بقاعدة
   المقطّع نفسها، رابط عارٍ)، ثمّ $$…$$ و\[…\] و\(…\) و$…$ (وفيها \$ مهرّبة). المرفوض يُعاد فحصه من الحرف التالي. */
const OMRAN_MATH_RE = /```[\s\S]*?(?:```|$)|`[^`\n]+`|\[[^\]]*\]\(https?:\/\/[^\s)]+\)|(?:https?:\/\/|www\.)[^\s<>"']+|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)|\$((?:\\.|[^\s$\\])(?:(?:\\.|[^$\n\\])*?(?:\\.|[^\s$\\]))?)\$/g;
// عربيّ خارج \text{} مقبول مع أمر LaTeX أو أسّ/دليل، أو متغيّرات عربيّة قصيرة مع علاقة («$2س + 3 = 11$»، «$ح = ط × ع × ل$») —
// لا «بين $5 و$10»
function omranMathArOk(s){
  const bare = String(s).replace(/\\(?:text|textrm|textbf|textit|mathrm|mbox|operatorname)\s*\{[^{}]*\}/g, '');
  if(!OMRAN_MATH_AR.test(bare) || /\\[A-Za-z]{2,}|[\^_]/.test(bare)) return true;
  return /[=<>×÷≤≥≠]/.test(bare) && !/[\u0621-\u064A]{4,}/.test(bare);
}
// المصدر بلا \text{…} ولا أسماء أوامر: لكشف كلام إنجليزيّ بين علامتي $$ ولمعرفة هل المعادلة لاتينيّة
function omranMathPlain(s){
  return String(s).replace(/\\(?:text|textrm|textbf|textit|mathrm|mbox|operatorname)\s*\{[^{}]*\}/g, ' ').replace(/\\[A-Za-z]+/g, ' ');
}
// شيفرة لا معادلة: هروب regex (\d \w \s \b)، صنف [^…]، snake_case بلا أمر LaTeX، أو | في طرف واحد فقط
function omranMathCodey(b){
  const t = String(b).trim();
  // الحدّ المطلق والمعيار (\left| x \right|، \|x\|، |x| + 1) ليسا شيفرة: أنبوب واحد فرديّ في طرف هو regex («|^\s+»)
  const p = t.replace(/\\(?:left|right|[bB]igg?[lr]?)(?![A-Za-z])/g, '').replace(/\\\|/g, '|').trim();
  return /\\[dwsDWSbB](?![A-Za-z])|\[\^/.test(t) || ((p.match(/\|/g) || []).length % 2 === 1 && (p.charAt(0) === '|' || p.charAt(p.length - 1) === '|'))
    || (/[A-Za-z0-9]{2,}_[A-Za-z]{2,}/.test(t) && !/\\[A-Za-z]{2,}/.test(t));
}
function omranMathOkInline(src, m, d, prev, next, cmd){
  const end = m.index + m[0].length;
  // CO$_2$، Na$^+$، $^{14}$C، 25$^\circ$C، Ca$^{2+}$ — لا $_GET$ (اسم متغيّر PHP)
  const lead = /^[\^_](?:\{[^{}]*\}|\\[A-Za-z]+|[A-Za-z]|\d+[+\-−]?|[+\-−])$/.test(d);
  const arVar = /^[\u0621-\u064A]{1,3}$/.test(d);                   // «حيث $ف$ المسافة»
  const oneCmd = /^\\[A-Za-z]+$/.test(d);                          // 3$\times$3، 5$\pm$0.1، $\sim$10
  if(d.length > 300 || (!arVar && !lead && !(omranMathArOk(d) && /[A-Za-z0-9\\\u0621-\u064A]/.test(d)))) return false;
  // قبلها: لا رقم/حرف/\/$ (10$، USD$5) — إلّا الأسّ الملتصق والأمر المفرد
  if(!lead && !oneCmd && /[0-9A-Za-z\\$]/.test(prev)) return false;
  // بعدها: لا رقم/حرف/$/(/{/_ ($5-$10، $HOME$PATH، ${a}${b}، $(pwd)) — إلّا الأسّ والأمر المفرد، وحرفًا أو قوسًا بعد معادلة
  // فيها أمر أو أسّ ($25^\circ$C، $H_2O$(l)، $x_i$s)، ولاحقة ترتيبيّة ($(k+1)$th)، وحرفًا بعد متغيّر مفرد ($n$th)
  if(!lead && !oneCmd && /[0-9A-Za-z$({_\\]/.test(next)){
    const okNext = (/[\\^_]/.test(d) && /[A-Za-z(]/.test(next)) || /^(?:th|st|nd|rd|s)(?![A-Za-z])/.test(src.slice(end, end + 4));
    if(!okNext) return false;
  }
  if(/^[\/"']|[\/"]$|[^A-Za-z0-9')]'$/.test(d)) return false; // اقتباس أو مسار — f' وf'' مقبولتان
  if(!lead && /[-+*\/=^_,.:;]$/.test(d.replace(/\\(?:left|right)\s*\.$/, ''))) return false;          // «$5-$» أثناء البثّ، و«=$A2^$B2» (لا شحنة Na$^+$)
  // رمز عملة بعد رقم: «$5 (A$ 7)»، «$5 vs A$ 8»، «from $2 to R$ 10»
  if(/^\d/.test(d) && /[A-Z]$/.test(d) && (/[\s(][A-Z]{1,3}$/.test(d) || /^ \d/.test(src.slice(end, end + 2)))) return false;
  // تبدأ بـ_ أو ^ وليست أسًّا ملتصقًا ($_GET$HOME)، أو بقوس معقوف بلا أمر (${a}C$): شيفرة لا معادلة
  if((/^[\^_]/.test(d) && !lead) || (/^\{/.test(d) && !cmd)) return false;
  if(cmd || /[\^_]/.test(d) || arVar) return true;
  // بلا أمر ولا أسّ: أقواس متوازنة، ولا كلام (كلمتان متتاليتان، أو رقم يليه كلام، أو كلمة من ٤ أحرف إلّا صيغة
  // كيميائيّة أو اسم شكل بلا مسافات ($NaOH$، $ABCD$) أو دالّة معروفة أو طرف علاقة ($Area = lw$))
  if((d.match(/[(\[]/g) || []).length !== (d.match(/[)\]]/g) || []).length) return false;
  // أرقام أو رموز بمسافة أو فاصلة بلا معامل بينها (خارج الأقواس): أسعار لا معادلة («$5 ,20$»، «$BTC 10$»، «$1,000 20$»)
  const noGrp = d.replace(/\([^()]*\)|\[[^\[\]]*\]/g, 'X');
  if(/\S\s+\S/.test(noGrp) && !/[=+\-*\/<>×÷·!|:]/.test(noGrp)) return false;
  if(/\d,\d{3}(?!\d)/.test(d) || /^\d[\d.,]*\s*[-–—]\s*\d[\d.,]*$/.test(d)) return false; // فاصل آلاف أو مدى «$5 - 10$»: سعر
  if(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(d) || (/^\d/.test(d) && /(?:^|[^A-Za-z])[A-Za-z]{2,}(?![A-Za-z])/.test(d))) return false;
  const noFn = d.replace(/(?:arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|exp|lim|max|min|det|gcd)(?![A-Za-z])/g, ' ');
  return !/[A-Za-z]{4,}/.test(noFn) || /^(?:[A-Z][a-z]?\d*){1,6}$/.test(d) || /^[A-Za-z]{2,6}$/.test(d) || /[=<>]/.test(d);
}
function omranMathOk(src, m, a, b, c, d, block){
  const body = a != null ? a : b != null ? b : c != null ? c : d;
  const bt = body.trim(), end = m.index + m[0].length, prev = src.charAt(m.index - 1), next = src.charAt(end);
  const cmd = /\\[A-Za-z]{2,}/.test(body);
  // مشترك: لا كود ولا عريض داخلها، ولا سطر فارغ، ولا ملتصقة بعلامة كود («```$a b$»)، ولا شيفرة
  if(!bt || body.length > 1000 || body.indexOf('```') >= 0 || body.indexOf('**') >= 0 || /\n[ \t]*\n/.test(body) || prev === '`' || omranMathCodey(body)) return false;
  // قوس إغلاق في أوّلها أو فتح في آخرها («Revenue ($) and Cost ($)») — إلّا مع أمر (الفترة الفرنسيّة $x \in ]0, 1[$)
  if(!cmd && (/^[)\]]/.test(bt) || /[(\[]$/.test(bt))) return false;
  if(d != null) return omranMathOkInline(src, m, d, prev, next, cmd);
  if(a != null){
    if(prev === '$' || a.charAt(0) === '$' || next === '$' || !omranMathArOk(a)) return false;
    // معادلة عرض في سطرها: تكفيها حروف أو أرقام؛ وعلامة «+ 456» أو «- (…)» داخل بيئة ليست بند قائمة
    if(block) return /[A-Za-z0-9\\\u0621-\u064A]/.test(a) && (/\\begin|&|\\\\/.test(a) || !/\n\s*(?:[-*+•]|\d+[.)])\s/.test(a));
    // $$ داخل السطر: فيها أمر أو ^ _ = < > +، ولا شيفرة (; أو علامات تنصيص: PID، $$name) ولا كلام إنجليزيّ (SQL)
    return a.indexOf('\n') < 0 && /\\[A-Za-z]|[\^_=<>+]/.test(a) && !/;\s|['"]/.test(a)
      && (cmd || !/[A-Za-z]{4,}/.test(a)) && !/[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(omranMathPlain(a));
  }
  // \[…\] و\(…\)
  if(!omranMathArOk(body)) return false;
  if(b != null && !block && /[A-Za-z0-9]/.test(prev) && !/\s/.test(body)) return false; // arr\[i_j\] فهرسة لا معادلة
  if(/\\[A-Za-z]{2,}|[\^_=]/.test(body)) return true;
  // بأسلوب ChatGPT «\( x \)» و«\( 2x + 3 \)»: مبطّنة بمسافة وفيها رقم أو معامل أو حرف مفرد — لا «\( and \)»
  return /^\s[\s\S]*\S\s$/.test(body) && /[0-9+\-<>()*\/]|(?:^|[^A-Za-z])[A-Za-z](?![A-Za-z])/.test(bt) && !/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(bt);
}
function omranMathMark(text){
  const src = String(text || '');
  const list = [];
  if(src.length > 100000 || (src.indexOf('$') < 0 && src.indexOf('\\') < 0) || /[\uE000\uE001]/.test(src)) return { text: src, list: list };
  const re = new RegExp(OMRAN_MATH_RE.source, 'g');
  let out = '', last = 0, m;
  while((m = re.exec(src))){
    const a = m[1], b = m[2], c = m[3], d = m[4];
    if(a == null && b == null && c == null && d == null) continue; // محميّ
    const body = a != null ? a : b != null ? b : c != null ? c : d;
    const end = m.index + m[0].length;
    let block = false;
    if(a != null || b != null){
      // معادلة عرض: وحدها في سطرها، أو متعدّدة السطور وفاتحها أوّل سطره أو غالقها آخر سطره («$$\nx = 5\n$$ حيث…»)
      const ls = src.lastIndexOf('\n', m.index - 1) + 1;
      let le = src.indexOf('\n', end); if(le < 0) le = src.length;
      const openAlone = !src.slice(ls, m.index).trim(), closeAlone = /^[\s.,،؛:]*$/.test(src.slice(end, le));
      block = (openAlone && closeAlone) || (body.indexOf('\n') >= 0 && (openAlone || closeAlone));
    }
    let ok = false;
    try{ ok = omranMathOk(src, m, a, b, c, d, block); }catch(e){ ok = false; }
    if(!ok){ re.lastIndex = m.index + 1; continue; }
    list.push({ src: body, raw: m[0], block: block, extra: (m[0].match(/\s+/g) || []).length, start: m.index, end: end });
    out += src.slice(last, m.index) + '\uE000' + (list.length - 1) + '\uE001';
    last = end;
  }
  return { text: list.length ? out + src.slice(last) : src, list: list };
}
function omranMathScript(str, sup){
  const map = sup ? OMRAN_MATH_SUP : OMRAN_MATH_SUB;
  const t = String(str).replace(/\s+/g, '');
  if(t && t.split('').every(function(ch){ return Object.prototype.hasOwnProperty.call(map, ch); })) return t.split('').map(function(ch){ return map[ch]; }).join('');
  return sup ? '\u0001' + str + '\u0002' : '\u0003' + str + '\u0004';
}
// طرف الكسر: البسيط بلا أقواس (1، π، x²، dy، ∂f)، والمركّب بين قوسين (-b ± √(…))
function omranMathWrap(x){
  const s = String(x).trim();
  return /^(?:\d+(?:[.,]\d+)?|[A-Za-z\u0621-\u064A]|\\[A-Za-z]+)(?:[\^_][A-Za-z0-9])?$/.test(s)
    || /^(?:d|\\partial|\\delta|\\Delta)\s*(?:\^\{?\d\}?)?\s*[A-Za-z](?:\s*\^\{?\d\}?)?$/.test(s)
    || /^\([^()]*\)$/.test(s) ? s : '(' + s + ')';
}
// كسر نصّيّ: ½ ¾ للبسيط (فـ«2\frac{1}{2}» = 2½ لا 21/2)، وإلّا a/b، وبين قوسين إن لاصق حدًّا آخر (KE = ½mv²، (a/b)²، (1/2)(1/3))
function omranMathFrac(x, y, prev, next){
  const xs = String(x).trim(), ys = String(y).trim();
  const v = OMRAN_MATH_VULGAR[xs + '/' + ys];
  if(v) return v;
  const r = omranMathWrap(xs) + '/' + omranMathWrap(ys);
  if(/[0-9]/.test(prev) && /^\d+$/.test(xs) && /^\d+$/.test(ys)) return ' ' + r; // عدد كسريّ: 2 5/7
  return /[A-Za-z0-9)}\]]/.test(prev) || /[A-Za-z0-9(\\^_]/.test(next) ? '(' + r + ')' : r;
}
// صيغة \ce: أيون أحاديّ الذرّة Cu2+ ⇐ Cu²⁺، والشحنة في آخر الصيغة NH4+ ⇐ NH₄⁺، والأرقام بعد الحروف أدلّة، و v/^ راسب/غاز
function omranMathCe(x){
  return String(x).replace(/<=>/g, '⇌').replace(/<->/g, '↔').replace(/->/g, '→').replace(/<-/g, '←')
    .replace(/(^|\s)v(?=\s|$)/g, '$1↓').replace(/(^|\s)\^(?=\s|$)/g, '$1↑')
    .split(/(\s+)/).map(function(tok){
      if(!tok.trim() || /^[+→←↔⇌↓↑=]$/.test(tok)) return tok;
      tok = tok.replace(/\^\{([^{}]*)\}|\^(\d*[+\-])/g, function(m0, p, q){ return omranMathScript(p != null ? p : q, true); });
      let mm = tok.match(/^(\d*)([A-Z][a-z]?)(\d+)([+\-])$/);
      if(mm) return mm[1] + mm[2] + omranMathScript(mm[3] + mm[4], true);
      let tail = '';
      mm = tok.match(/^([\s\S]*[A-Za-z0-9)\]])([+\-])$/);
      if(mm){ tok = mm[1]; tail = omranMathScript(mm[2], true); }
      return tok.replace(/([A-Za-z)\]])(\d+)/g, function(m1, p, dg){ return p + omranMathScript(dg, false); }) + tail;
    }).join('');
}
// صفوف بيئة (\\) وخلاياها (&): المصفوفة بأقواسها، والحالات بقوس «{» وقيمة، شرط
function omranMathRows(body, cellSep){
  return String(body).split(/\\\\/).map(function(r){ return r.split('&').map(function(c){ return c.trim(); }).filter(Boolean).join(cellSep); })
    .filter(function(r){ return r.trim(); });
}
// LaTeX بسيط ⇐ نصّ؛ \u0001…\u0002 أسّ، \u0003…\u0004 دليل، \u0005…\u0006 سهم متّجه فوق اسم من حرفين فأكثر
function omranMathText(src, block){
  let s = String(src).trim()
    .replace(/\\text\s*\{[^{}]*\}|'{1,3}/g, function(x){ return x.charAt(0) === '\\' ? x : ['′', '″', '‴'][x.length - 1]; }) // f' ⇐ f′
    .replace(/\\begin\s*\{([pbvBV]?)matrix\*?\}([\s\S]*?)\\end\s*\{[pbvBV]?matrix\*?\}/g, function(m0, k, body){
      const L = { p: '(', b: '[', v: '|', V: '‖', B: '\uE011' }[k] || '', R = { p: ')', b: ']', v: '|', V: '‖', B: '\uE012' }[k] || '';
      return L + omranMathRows(body, ' ').join('; ') + R;
    })
    // الحالات والمصفوفة array: صفوف معادلة العرض كتلة داخليّة (\u0007…\u0008) تبدأ كلّها بعد «{» على خطّ واحد
    .replace(/\\begin\s*\{cases\*?\}([\s\S]*?)\\end\s*\{cases\*?\}/g, function(m0, body){
      const rows = omranMathRows(body, ', ');
      return '\uE011 ' + (block && rows.length > 1 ? '\u0007' + rows.join('\n') + '\u0008' : rows.join('; '));
    })
    .replace(/\\begin\s*\{array\}\s*(?:\{[^{}]*\})?([\s\S]*?)\\end\s*\{array\}/g, function(m0, body){
      const rows = omranMathRows(body, ', ');
      return block && rows.length > 1 ? '\u0007' + rows.join('\n') + '\u0008' : rows.join('; ');
    })
    .replace(/\\begin\s*\{[A-Za-z*]+\}(?:\{[^{}]*\})?|\\end\s*\{[A-Za-z*]+\}/g, '')
    .replace(/\\\\(?:\[[^\]]*\])?/g, block ? '\n' : '; ')
    .replace(/\\\{/g, '\uE011').replace(/\\\}/g, '\uE012').replace(/\\_/g, '\uE013').replace(/\\&/g, '\uE014').replace(/\\\|/g, '‖')
    .replace(/\\([%$#])/g, '$1')
    .replace(/\s*\\(?:no)?limits(?![A-Za-z])\s*/g, '')
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|hline|middle|notag|nonumber)(?![A-Za-z])/g, '')
    .replace(/\\(?:label|tag|phantom|hphantom|vphantom)\s*\{[^{}]*\}/g, '').replace(/\\[hv]space\*?\s*\{[^{}]*\}/g, ' ')
    .replace(/\\pmod\s*\{([^{}]*)\}/g, ' (mod $1)').replace(/\\(?:bmod|mod)(?![A-Za-z])/g, ' mod ')
    .replace(/\\not\s*=/g, '≠').replace(/\\not\s*\\in(?![A-Za-z])/g, '∉').replace(/\\not\s*\\equiv(?![A-Za-z])/g, '≢')
    .replace(/\\not\s*\\subset(?![A-Za-z])/g, '⊄').replace(/\\not\s*\\mid(?![A-Za-z])/g, '∤')
    .replace(/\\not\s*(\\[A-Za-z]+|[^\s\\])/g, '$1\u0338')
    // حدّ بعد اسم الأمر إن تلاه أمر: «\Delta\text{H}» كانت تصير «\DeltaH» بعد فكّ \text فيسقط الحدّ
    .replace(/(\\[A-Za-z]+)(?=\\)/g, '$1 ')
    .replace(/\\(?:left|right)\s*\./g, '')
    .replace(/\\(?:left|right|[bB]igg?[lr]?)(?![A-Za-z])/g, '')
    .replace(/\\[,;:!> ]/g, ' ')
    .replace(/\^\s*\{\s*\\circ\s*\}|\^\s*\\circ(?![A-Za-z])|\\degree(?![A-Za-z])/g, '°')
    .replace(/\\(?:text)?color\s*\{[^{}]*\}/g, '');
  for(let n = 0; n < 12; n++){
    const nxt = s
      .replace(/\\ce\s*\{([^{}]*)\}/g, function(m0, x){ return omranMathCe(x); })
      .replace(/\\(?:text|textrm|textbf|textit|textnormal|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathscr|mathfrak|operatorname\*?|boxed|fbox|mbox|hbox|pu|underline|emph|bm|boldsymbol|cancel|bcancel|xcancel|overbrace|underbrace|ensuremath|mathop|mathrel|mathbin)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\mathbb\s*\{([^{}]*)\}/g, function(m0, x){ return x.replace(/[A-Z]/g, function(ch){ return OMRAN_MATH_DS[ch] || ch; }); })
      .replace(/\\(vec|overrightarrow|hat|widehat|bar|overline|tilde|widetilde|dot|ddot|mathring)\s*\{([^{}]*)\}/g, function(m0, k, x){
        const mk = OMRAN_MATH_ACC[k], t = x.trim();
        if((k === 'vec' || k === 'overrightarrow') && /^[A-Za-z0-9]{2,}$/.test(t)) return '\u0005' + t + '\u0006'; // سهم المتّجه فوق الاسم كلّه لا فوق حرفه الأخير
        return /^[A-Za-z0-9]+$/.test(t) && (k === 'bar' || k === 'overline') ? t.replace(/./g, '$&' + mk) : t + mk;
      })
      .replace(/\\(vec|hat|bar|tilde|dot|ddot)\s+([A-Za-z0-9])/g, function(m0, k, x){ return x + OMRAN_MATH_ACC[k]; })
      .replace(/\\[dtc]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function(m0, x, y, off, all){ return omranMathFrac(x, y, all.charAt(off - 1), all.charAt(off + m0.length)); })
      .replace(/\\[dtc]?frac\s*(\d)\s*(\d)/g, function(m0, x, y, off, all){ return omranMathFrac(x, y, all.charAt(off - 1), all.charAt(off + m0.length)); })
      .replace(/\\binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, 'C($1, $2)')
      .replace(/\\x(rightarrow|leftarrow|rightleftharpoons|leftrightarrow|Rightarrow|Leftarrow)\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g, function(m0, k, x){ return OMRAN_MATH_XARROW[k] + '^{' + x + '}'; })
      .replace(/\\(?:overset|stackrel)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$2^{$1}')
      .replace(/\\underset\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$2_{$1}')
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, function(m0, k, x){ return '^{' + k + '}√' + omranMathWrap(x); })
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, function(m0, x){ return '√' + omranMathWrap(x); })
      .replace(/\^\s*\{([^{}]*)\}/g, function(m0, x){ return omranMathScript(x, true); })
      .replace(/_\s*\{([^{}]*)\}/g, function(m0, x){ return omranMathScript(x, false); });
    if(nxt === s) break;
    s = nxt;
  }
  s = s.replace(/\\([A-Za-z]+)\*?([ \t]*)/g, function(m0, w, sp, off, all){
    const nx = all.charAt(off + m0.length);
    if(OMRAN_MATH_FUNC.test(w)) return w + (sp || /[A-Za-z0-9\\]/.test(nx) ? ' ' : '');
    // أمر مجهول يبقى كما كُتب (\name) — إسقاطه كان يقلب المعنى بصمت (\not= ⇐ «=»)
    if(!Object.prototype.hasOwnProperty.call(OMRAN_MATH_SYM, w)) return '\\' + w + sp;
    const sym = OMRAN_MATH_SYM[w];
    if(sym.length === 1 && OMRAN_MATH_BIN.indexOf(sym) >= 0) return ' ' + sym + ' ';
    // المسافة بعد اسم الأمر فاصل لا مسافة: «\Delta x» ⇐ Δx و«\pi r^2» ⇐ πr²
    return sym + (sp && !(OMRAN_MATH_ORD.test(sym) && /[A-Za-z0-9(]/.test(nx)) ? sp : '');
  })
    .replace(/\^\s*([^\s{}\\\u0001-\u0008])/g, function(m0, ch){ return omranMathScript(ch, true); })
    .replace(/_\s*([^\s{}\\\u0001-\u0008])/g, function(m0, ch){ return omranMathScript(ch, false); })
    .replace(/[{}]/g, '').replace(/&/g, ' ').replace(/~/g, ' ')
    .replace(/\uE011/g, '{').replace(/\uE012/g, '}').replace(/\uE013/g, '_').replace(/\uE014/g, '&')
    .replace(/[ \t]+/g, ' ');
  return s.split('\n').map(function(l){ return l.trim(); }).filter(Boolean).join('\n');
}
// للمشاركة والنسخ (innerText): e^(-x) لا «e-x» — علامة ^( ) أو _( ) مخفيّة بصريًّا حول الأسّ والدليل المرسومين بعنصر
function omranMathSr(x){
  if(/\bom-rows\b/.test(x.className)) return;
  const t = x.textContent, many = t.length > 1;
  const a = document.createElement('span');
  a.className = 'om-math-sr';
  a.textContent = (/^sup$/i.test(x.tagName) ? '^' : /^sub$/i.test(x.tagName) ? '_' : '→') + (many ? '(' : '');
  x.insertBefore(a, x.childNodes[0] || null);
  if(many){ const b = document.createElement('span'); b.className = 'om-math-sr'; b.textContent = ')'; x.appendChild(b); }
}
function omranMathEl(item){
  let txt = omranMathText(item.src, item.block);
  if(!txt.replace(/[\u0001-\u0008]/g, '').trim()) return document.createTextNode(item.raw);
  // لا حروف لاتينيّة خارج \text{} ⇐ معادلة عربيّة (ع = ف/ز، 2س + 3 = 11): rtl وتنعكس الأسهم كي تشير إلى النواتج.
  // وإلّا لاتينيّة ولو بتسميات عربيّة (6CO₂ →^{ضوء الشمس} …): ltr كي لا ينقلب التفاعل
  const rtl = OMRAN_MATH_AR.test(txt) && !/[A-Za-z]/.test(omranMathPlain(item.src));
  if(rtl) txt = txt.replace(/[→←⟶⟵⇒⇐⟹⟸⇌⇋↦↤]/g, function(ch){ return OMRAN_MATH_MIRROR[ch]; });
  // الالتفاف: القصيرة في السطر لا تنكسر أبدًا (om-math-nw: «kJ ·» ثمّ «mol⁻¹»، «AB» ثمّ «= b - a»)، والكسر لا ينكسر عند شرطته، والطويلة تنكسر
  // بعد المعاملات وبين المجموعات الكيميائيّة (…)₆|(OH) لا بين حرف وأسّه
  const nw = !item.block && txt.length <= 32;
  txt = txt.replace(/\//g, '\u2060/\u2060');
  if(txt.length > 32) txt = txt.replace(/([+=×·<>≤≥→⇌−])(?=[^\s\u00A0\u0002\u0004\u0006\u0008])/g, '$1\u200B')
    .replace(/([\u2080-\u2089\u00B2\u00B3\u00B9\u2070-\u2079)])(?=[A-Z(])/g, '$1\u200B');
  const el = document.createElement('span');
  el.className = 'om-math' + (item.block ? ' om-math-block' : '') + (nw ? ' om-math-nw' : '');
  el.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  el.style.unicodeBidi = 'isolate';
  const stack = [el];
  txt.split(/([\u0001-\u0008])/).forEach(function(p){
    if(!p) return;
    const top = stack[stack.length - 1];
    if(p === '\u0001' || p === '\u0003' || p === '\u0005' || p === '\u0007'){
      const x = document.createElement(p === '\u0001' ? 'sup' : p === '\u0003' ? 'sub' : 'span');
      if(p === '\u0005') x.className = 'om-vec';
      if(p === '\u0007') x.className = 'om-rows';
      top.appendChild(x); stack.push(x);
    }
    else if(p === '\u0002' || p === '\u0004' || p === '\u0006' || p === '\u0008'){ if(stack.length > 1) omranMathSr(stack.pop()); }
    else top.appendChild(document.createTextNode(p));
  });
  while(stack.length > 1) omranMathSr(stack.pop());
  return el;
}
/* v-chat-math: توكن فيه معادلة ونصّ لاتينيّ أو رقميّ ملتصق بها («$x$-axis»، «25$^\circ$C،»، «وCO$_2$»، «(Na$^+$») يُعزل
   الجزء اللاتينيّ مع المعادلة بغلاف داخل التوكن نفسه (عنصر tts-word واحد) كي لا يقلبه السطر العربيّ («C°25»، «⁻Cl»).
   خارج العزل: سابقة عربيّة (و، ب، ال)، وقوس فتح أو إغلاق شريكه خارج التوكن («(مثل CO₂)» — داخل العزل يُرسم بلا
   انعكاس)، وترقيم آخره (، . ؛) فيبقى في مكانه من الجملة العربيّة. */
function omranMathIsoTok(span){
  const kids = span.childNodes, n = kids.length;
  if(!n) return;
  let bare = '';
  Array.prototype.forEach.call(kids, (k) => { if(k.nodeType === 3) bare += k.textContent; });
  let op = (bare.match(/[(\[]/g) || []).length, cl = (bare.match(/[)\]]/g) || []).length;
  const first = kids[0].nodeType === 3 ? kids[0] : null, last = n > 1 && kids[n - 1].nodeType === 3 ? kids[n - 1] : null;
  let lead = '', tail = '';
  if(last){
    const t = last.textContent;
    let i = t.length;
    while(i > 0){ const ch = t.charAt(i - 1); if(/[،؛؟.,:;!?»"']/.test(ch)) i--; else if(/[)\]]/.test(ch) && cl > op){ cl--; i--; } else break; }
    tail = t.slice(i);
  }
  // زوج أقواس يحيط بالتوكن كلّه «(وCO$_2$)»: القوسان خارج العزل، ثمّ تُطلب السابقة العربيّة بعد القوس
  let outer = 0;
  if(first && last && /^[(\[]/.test(first.textContent)){
    const lt = last.textContent.slice(0, last.textContent.length - tail.length), close = first.textContent.charAt(0) === '(' ? ')' : ']';
    if(lt.charAt(lt.length - 1) === close){ tail = close + tail; op--; cl--; outer = 1; }
  }
  if(first){
    const t = first.textContent;
    let i = outer;
    while(i < t.length){ const ch = t.charAt(i); if(/[\u0621-\u064A«"']/.test(ch)) i++; else if(/[(\[]/.test(ch) && op > cl){ op--; i++; } else break; }
    lead = t.slice(0, i);
  }
  const mid = bare.slice(lead.length, bare.length - tail.length);
  if(!/[A-Za-z0-9]/.test(mid) || OMRAN_MATH_ARL.test(mid)) return;
  if(tail) last.textContent = last.textContent.slice(0, -tail.length);
  if(lead) first.textContent = first.textContent.slice(lead.length);
  const iso = document.createElement('span');
  iso.setAttribute('dir', 'ltr'); iso.style.unicodeBidi = 'isolate';
  Array.prototype.slice.call(kids).forEach((k) => { if(!(k.nodeType === 3 && !k.textContent)) iso.appendChild(k); else span.removeChild(k); });
  if(lead) span.appendChild(document.createTextNode(lead));
  span.appendChild(iso);
  if(tail) span.appendChild(document.createTextNode(tail));
}
/* v-gpt-format (المالك ١٣ أكتوبر: «المحادثة العاديه قلت اريدها مرتبه» ثمّ «نفس gpt» بلقطتي ChatGPT: جدول حقيقيّ بعنوانه وخطوط
   صفوفه، وكود مضمّن بلا علامات ` ظاهرة): (١) جدول الماركداون الكامل (رأس + سطر فاصل) يُستبدل قبل التقطيع برمز حارس (E002 n E003)
   ويُرسم <table> حقيقيًّا كتلةً كصندوق الكود؛ خلاياه بعريضها وكودها وروابطها، وكلمات سطوره القديمة (mdTablesToLines) عناصر tts-word
   مخفيّة داخله فلا تنزاح القراءة الصوتيّة عمّا كانت. الجداول داخل سياج كود لا تُمسّ، وما بلا سطر فاصل يبقى سطورًا كما كان.
   (٢) `كود` مضمّن يُرسم رقاقة <code class="md-ic"> داخل عنصر كلمته نفسه — عنصر لكلّ كلمة كما كان — والكود الممتدّ على كلمات يصل
   بين رقائقه بفراغ ملوّن (md-ic-gap ليس tts-word). سطر جديد يغلقه. */
function omranMdTableMark(text){
  const lines = String(text || '').split('\n'), out = [], list = [];
  const row = (l) => /^\s*\|.*\|\s*$/.test(l || '');
  const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  let fence = false;
  for(let i = 0; i < lines.length; i++){
    const l = lines[i];
    if(/^\s*```/.test(l)) fence = !fence;
    if(!fence && row(l) && !isSep(l) && isSep(lines[i + 1])){
      let j = i + 2;
      while(j < lines.length && row(lines[j]) && !isSep(lines[j])) j++;
      const block = lines.slice(i, j);
      list.push({ head: cells(block[0]), rows: block.slice(2).map(cells), extra: (mdTablesToLines(block.join('\n')).match(/\S+/g) || []).length });
      out.push('\uE002' + (list.length - 1) + '\uE003');
      i = j - 1;
      continue;
    }
    out.push(l);
  }
  return { text: out.join('\n'), list: list };
}
const OMRAN_IC_AR = /[\u0600-\u06FF]/; // كود مضمّن بحروف عربيّة: رقاقة <span> بخطّ النصّ — الخطّ الثابت يفكّك الحروف
/** خليّة جدول: **عريض** و`كود` و[نصّ](رابط) — عُقدًا لا HTML. v-reply-blocks: الرابط شارة مصدر (أيقونة الموقع + اسمه، ولو
    كان **[نصّ](رابط)**)، وأرقام الهواتف في النصّ معزولة LTR فلا تنقلب مجموعاتها. */
function omranMdInline(el, s){
  const re = /\*{0,2}\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\*{0,2}|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let m, last = 0;
  s = String(s || '');
  while((m = re.exec(s))){
    if(m.index > last) omranMdText(el, s.slice(last, m.index));
    let k;
    if(m[1] !== undefined) k = omranSrcChip(m[2], m[1]);
    else if(m[3] !== undefined){ k = document.createElement('strong'); omranMdText(k, m[3]); }
    else { const ar = OMRAN_IC_AR.test(m[4]); k = document.createElement(ar ? 'span' : 'code'); k.className = 'md-ic' + (ar ? ' md-ic-ar' : ''); k.textContent = m[4]; }
    el.appendChild(k);
    last = m.index + m[0].length;
  }
  if(last < s.length) omranMdText(el, s.slice(last));
}
/** نصّ خليّة: رقم هاتف (٧ خانات فأكثر بمسافاته وشرطاته) عنصر LTR معزول، والباقي نصّ كما هو. الرقم الملاصق لـ«: , . /»
    أو لرقم آخر (وقت «9:00 - 17:00»، سعر «1,000 - 2,000»، كسر) ليس هاتفًا فيبقى نصًّا. بلا lookbehind (سفاري القديم): السابق يُلتقط. */
function omranMdText(el, s){
  const re = /(^|[^0-9٠-٩۰-۹:,.\/])((?:\+|00)?[0-9٠-٩۰-۹](?:[0-9٠-٩۰-۹]|[ \-](?=[0-9٠-٩۰-۹])){5,}[0-9٠-٩۰-۹])(?![0-9٠-٩۰-۹:,.\/])/g;
  let m, last = 0;
  s = String(s || '');
  while((m = re.exec(s))){
    if((m[2].match(/[0-9٠-٩۰-۹]/g) || []).length < 7) continue;
    const at = m.index + m[1].length;
    if(at > last) el.appendChild(document.createTextNode(s.slice(last, at)));
    const sp = document.createElement('span'); sp.className = 'md-ltr'; sp.setAttribute('dir', 'ltr'); sp.textContent = m[2];
    el.appendChild(sp);
    last = at + m[2].length;
  }
  if(last < s.length) el.appendChild(document.createTextNode(s.slice(last)));
}
function omranMdTableEl(tb){
  const wrap = document.createElement('div'); wrap.className = 'md-table-wrap';
  const all = tb.head.concat.apply(tb.head, tb.rows).join(' ');
  wrap.setAttribute('dir', /[ؠ-يٮ-ۓۺ-ۿݐ-ݿ]/.test(all) ? 'rtl' : 'ltr');
  const table = document.createElement('table'); table.className = 'md-table';
  const n = Math.max(tb.head.length, ...tb.rows.map((r) => r.length));
  const tr = (cells, tag) => { const r = document.createElement('tr'); for(let i = 0; i < n; i++){ const c = document.createElement(tag); omranMdInline(c, cells[i] || ''); r.appendChild(c); } return r; };
  const thead = document.createElement('thead'); thead.appendChild(tr(tb.head, 'th')); table.appendChild(thead);
  const tbody = document.createElement('tbody'); tb.rows.forEach((r) => tbody.appendChild(tr(r, 'td'))); table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}
/** كلمة فيها ` (أو داخل كود مفتوح): تُملأ رقائق md-ic؛ st.open يحمل الكود المفتوح إلى الكلمة التالية. false = ليست كودًا. */
function omranIcTok(span, s, st){
  s = String(s);
  if((s.indexOf('`') === -1 && !st.open) || /^```/.test(s)) return false;
  const parts = s.split('`');
  let inside = st.open;
  parts.forEach(function(p, i){
    if(i > 0) inside = !inside;
    if(!p) return;
    if(!inside){ span.appendChild(document.createTextNode(p)); return; }
    const ar = OMRAN_IC_AR.test(p);
    const c = document.createElement(ar ? 'span' : 'code'); // خطّ المحادثة يفرض الخطّ الثابت على كلّ <code> بـ!important
    c.className = 'md-ic' + (i === 0 && st.open ? ' md-ic-ps' : '') + (i === parts.length - 1 ? ' md-ic-pe' : '') + (ar ? ' md-ic-ar' : '');
    c.textContent = p;
    span.appendChild(c);
  });
  st.open = inside;
  return true;
}
/* v-rich-reply (لقطة المالك ١٣ أكتوبر، ChatGPT: صور حقيقيّة تحت كلّ دولة — «اريد الردود… وفيها صور»): سطر المزوّد
   [[IMG: اسم / English | اسم٢ …]] يُرسم معرضًا كتلةً كالجدول (صورة كبيرة وصغيرتان و«+N»)، والصور الحقيقيّة من ويكيبيديا
   مباشرة من المتصفّح (مجّانيّة بلا مفتاح؛ CORS بـorigin=*) بعد ظهور النصّ فلا تبطّئ الردّ. كلّ اسم يُطلب مرّة في الجلسة (الوعد
   محفوظ) فإعادة الرسم أثناء البثّ لا تعيد الطلب. اسم بلا صورة يسقط، ومعرض بلا صورة يختفي. كلمات السطر عناصر tts-word مخفيّة
   كالجدول فلا تنزاح القراءة الصوتيّة، وسطر لم يُغلق بعد أثناء البثّ لا يظهر خامًا. */
const OMRAN_IMG_LINE = /^\s*\[\[IMG:\s*([^\]\n]*)\]\]\s*$/i;
function omranImgItems(body){
  return String(body || '').split('|').map(function(x){ return x.replace(/\s+/g, ' ').trim(); }).filter(Boolean).slice(0, 6);
}
/** آخر سطر أثناء البثّ بداية سطر صور لم يُغلق («[»، «[[IM»، «[[IMG: برج خ…») */
function omranImgPartial(l){
  const t = String(l || '').trim();
  if(!t || /\]\]$/.test(t)) return false;
  return /^\[\[(?:IMG|CONTACT):/i.test(t) || '[[IMG:'.indexOf(t.toUpperCase()) === 0 || '[[CONTACT:'.indexOf(t.toUpperCase()) === 0; // v-reply-blocks: وسطر بطاقة التواصل
}
function omranMdImgMark(text){
  const lines = String(text || '').split('\n'), out = [], list = [];
  let fence = false;
  for(let i = 0; i < lines.length; i++){
    const l = lines[i];
    if(/^\s*```/.test(l)) fence = !fence;
    const __c = !fence && OMRAN_CT_LINE.exec(l), __ci = __c && omranCtItem(__c[1]);
    if(__ci){ // v-reply-blocks: أسطر التواصل المتتالية (ولو بينها سطر فارغ) شبكة بطاقات واحدة
      const g = { kind: 'contact', items: [__ci], extra: (l.match(/\S+/g) || []).length };
      for(let j = i + 1; j < lines.length; j++){
        if(!lines[j].trim()) continue;
        const c2 = OMRAN_CT_LINE.exec(lines[j]), ci2 = c2 && omranCtItem(c2[1]);
        if(!ci2) break;
        g.items.push(ci2); g.extra += (lines[j].match(/\S+/g) || []).length; i = j;
      }
      list.push(g); out.push(String.fromCharCode(0xE004) + (list.length - 1) + String.fromCharCode(0xE005)); continue;
    }
    const m = !fence && OMRAN_IMG_LINE.exec(l);
    if(m){
      const items = omranImgItems(m[1]);
      if(items.length){ list.push({ items: items, extra: (l.match(/\S+/g) || []).length }); out.push('\uE004' + (list.length - 1) + '\uE005'); continue; }
    }
    out.push(l);
  }
  return { text: out.join('\n'), list: list };
}
const __omImgSeen = new Map(); // الاسم ← وعد {src, title} أو null
const __omImgDone = new Map(); // الاسم ← النتيجة بعد وصولها (رسم فوريّ بلا هيكل عند إعادة الرسم)
function omranImgLookup(name){
  const key = String(name || '').trim().toLowerCase();
  if(__omImgSeen.has(key)) return __omImgSeen.get(key);
  const parts = String(name || '').split('/').map(function(x){ return x.trim(); }).filter(Boolean);
  const ar = parts.filter(function(x){ return /[؀-ۿ]/.test(x); })[0] || '';
  const lat = parts.filter(function(x){ return !/[؀-ۿ]/.test(x); })[0] || '';
  const tries = [];
  if(lat) tries.push(['en', lat]);
  if(ar) tries.push(['ar', ar]);
  const p = (async function(){
    for(const tr of tries){
      try{
        const u = 'https://' + tr[0] + '.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&generator=search&gsrlimit=1'
          + '&prop=pageimages&piprop=thumbnail&pithumbsize=800&gsrsearch=' + encodeURIComponent(tr[1]);
        const r = await fetch(u);
        if(!r.ok) continue;
        const j = await r.json();
        const pages = (j && j.query && j.query.pages) ? Object.keys(j.query.pages).map(function(k){ return j.query.pages[k]; }) : [];
        const pg = pages.filter(function(x){ return x && x.thumbnail && /^https:\/\/upload\.wikimedia\.org\//.test(x.thumbnail.source || ''); })[0];
        if(pg && !/\.svg\.png(?:$|\?)/i.test(pg.thumbnail.source)) return { src: pg.thumbnail.source, title: ar || pg.title || tr[1] }; // الأعلام والشعارات والخرائط (svg) ليست صورًا
      }catch(e){ __swallow(e, 'gallery:wiki'); }
    }
    return null;
  })();
  __omImgSeen.set(key, p);
  p.then(function(v){ __omImgDone.set(key, v); });
  return p;
}
function omranGalleryCss(){
  if(document.getElementById('omranGalleryCss')) return;
  const st = document.createElement('style');
  st.id = 'omranGalleryCss';
  st.textContent = '.md-gallery{display:grid;gap:4px;margin:10px 0 12px;width:100%;align-self:stretch;box-sizing:border-box;border-radius:16px;overflow:hidden;height:300px;grid-template-columns:1fr;grid-template-rows:1fr;}'
    + '.md-gallery[data-n="2"]{grid-template-columns:1fr 1fr;}'
    + '.md-gallery[data-n="3"]{grid-template-columns:1.45fr 1fr;grid-template-rows:1fr 1fr;}'
    + '.md-gallery[data-n="3"] .md-gal-cell:first-child{grid-row:1 / span 2;}'
    + '.md-gal-cell{position:relative;border:0;padding:0;margin:0;cursor:zoom-in;overflow:hidden;background:rgba(127,127,127,.16);min-height:0;}'
    + '.md-gal-cell img{width:100%;height:100%;object-fit:cover;display:block;}'
    + '.md-gal-cell.skel{animation:mdGalPulse 1.2s ease-in-out infinite;cursor:default;}'
    + '.md-gal-more{position:absolute;bottom:8px;inset-inline-start:8px;padding:2px 9px;border-radius:12px;background:rgba(0,0,0,.6);color:#fff;font-size:12.5px;font-weight:700;}'
    + '@keyframes mdGalPulse{50%{opacity:.55}}'
    + '@media (max-width:640px){.md-gallery{height:220px;}}';
  document.head.appendChild(st);
}
function omranGalleryLayout(g){
  const cells = Array.prototype.slice.call(g.querySelectorAll('.md-gal-cell'));
  if(!cells.length){ g.remove(); return; }
  const shown = Math.min(cells.length, 3);
  cells.forEach(function(c, i){ c.style.display = i < shown ? '' : 'none'; });
  g.setAttribute('data-n', String(shown));
  const old = g.querySelector('.md-gal-more'); if(old) old.remove();
  if(cells.length > shown){ const b = document.createElement('span'); b.className = 'md-gal-more'; b.textContent = '+' + (cells.length - shown); cells[shown - 1].appendChild(b); }
}
function omranGalleryEl(it){
  omranGalleryCss();
  const g = document.createElement('div');
  g.className = 'md-gallery';
  g.setAttribute('contenteditable', 'false');
  let pending = 0;
  const fill = function(cell, v){
    if(!v){ cell.remove(); return; }
    cell.classList.remove('skel');
    const img = document.createElement('img');
    img.src = v.src; img.alt = v.title || ''; img.title = v.title || ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onerror = function(){ cell.remove(); omranGalleryLayout(g); };
    cell.onclick = function(e){ e.stopPropagation(); if(window.omranLightbox) window.omranLightbox(v.src.replace(/\/\d+px-/, '/1280px-')); else window.open(v.src, '_blank', 'noopener'); };
    cell.appendChild(img);
  };
  it.items.forEach(function(name){
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = 'md-gal-cell';
    g.appendChild(cell);
    const key = String(name).trim().toLowerCase();
    if(__omImgDone.has(key)){ fill(cell, __omImgDone.get(key)); return; }
    cell.classList.add('skel');
    pending++;
    omranImgLookup(name).then(function(v){ fill(cell, v); }, function(){ cell.remove(); }).then(function(){ if(--pending === 0) omranGalleryLayout(g); });
  });
  omranGalleryLayout(g);
  if(!g.querySelector('.md-gal-cell')) g.style.display = 'none';
  return g;
}
/** القراءة الصوتيّة: كلمات سطر الصور تبقى بعددها (محاذاة tts-word) لكنّها لا تُنطق. */
function omranSpeechNoImg(text){
  text = omranSpeechNoCt(text); // v-reply-blocks: وأسطر بطاقات التواصل كذلك
  const s = String(text || '');
  if(s.indexOf('[[IMG') < 0 && s.indexOf('[[img') < 0) return s;
  return s.split('\n').map(function(l){ return OMRAN_IMG_LINE.test(l) ? l.replace(/\S+/g, '\u2060') : l; }).join('\n');
}
/* v-reply-blocks (\u0644\u0642\u0637\u0627\u062a \u0627\u0644\u0645\u0627\u0644\u0643 \u0661\u0667 \u0623\u0643\u062a\u0648\u0628\u0631\u060c ChatGPT: \u00ab\u0623\u0631\u0642\u0627\u0645 \u0645\u0643\u0627\u062a\u0628 \u0639\u0642\u0627\u0631\u064a\u0651\u0629 \u0641\u064a \u0627\u0644\u0634\u0627\u0631\u0642\u0629\u00bb \u0628\u0637\u0627\u0642\u0627\u062a \u0628\u0627\u0644\u0627\u0633\u0645 \u0648\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0643\u0628\u064a\u0631 \u0648\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0648\u00ab\u0646\u0633\u062e \u0627\u0644\u0631\u0642\u0645\u00bb\u060c
   \u0648\u062c\u062f\u0648\u0644 \u0628\u0627\u0626\u0639\u064a\u0646 \u0628\u0634\u0627\u0631\u0629 \u0627\u0644\u0645\u0635\u062f\u0631 \u062c\u0646\u0628 \u0643\u0644\u0651 \u0631\u0642\u0645): \u0633\u0637\u0631 \u0627\u0644\u0645\u0632\u0648\u0651\u062f [[CONTACT: \u0627\u0644\u0627\u0633\u0645 | \u0627\u0644\u0631\u0642\u0645 | \u0627\u0644\u0645\u0646\u0637\u0642\u0629 | [\u0627\u0644\u0645\u0648\u0642\u0639](\u0627\u0644\u0631\u0627\u0628\u0637)]] \u0628\u0637\u0627\u0642\u0629\u060c \u0648\u0627\u0644\u0623\u0633\u0637\u0631
   \u0627\u0644\u0645\u062a\u062a\u0627\u0644\u064a\u0629 \u0634\u0628\u0643\u0629 \u0648\u0627\u062d\u062f\u0629 \u0643\u062a\u0644\u0629\u064b \u0643\u0627\u0644\u0645\u0639\u0631\u0636 (\u0643\u0644\u0645\u0627\u062a\u0647\u0627 tts-word \u0645\u062e\u0641\u064a\u0651\u0629 \u0641\u0644\u0627 \u062a\u0646\u0632\u0627\u062d \u0627\u0644\u0642\u0631\u0627\u0621\u0629\u060c \u0648\u0644\u0627 \u062a\u064f\u0646\u0637\u0642). \u0627\u0644\u0631\u0642\u0645 LTR \u0645\u0639\u0632\u0648\u0644: \u0628\u0644\u0627 \u0639\u0632\u0644 \u062a\u0646\u0642\u0644\u0628
   \u0645\u062c\u0645\u0648\u0639\u0627\u062a\u0647 \u0641\u064a \u0627\u0644\u0633\u064a\u0627\u0642 \u0627\u0644\u0639\u0631\u0628\u064a\u0651 (\u00ab7465 171 050\u00bb \u0639\u0646\u062f ChatGPT \u0646\u0641\u0633\u0647). \u0627\u0644\u062e\u0627\u062f\u0645 \u064a\u062d\u0630\u0641 \u0631\u0642\u0645\u064b\u0627 \u0644\u0645 \u064a\u0638\u0647\u0631 \u0641\u064a \u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0628\u062d\u062b (keepSourcedContacts).
   \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0628\u0644\u0627 \u062d\u062f\u0651 (\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u062f\u0627\u0643\u0646 \u064a\u062d\u0648\u0651\u0644 \u0643\u0644\u0651 \u062d\u062f\u0651 \u0625\u0644\u0649 \u0634\u0628\u062d \u0628\u062a\u0648\u0647\u0651\u062c \u0623\u0628\u064a\u0636)\u060c \u0648\u0627\u0644\u0631\u0642\u0645 \u0628\u0644\u0648\u0646 \u0627\u0644\u0646\u0635\u0651 \u0644\u0627 \u0627\u0644\u0630\u0647\u0628\u064a\u0651 (\u0627\u0644\u0630\u0647\u0628\u064a\u0651 \u0644\u0644\u0631\u0648\u0627\u0628\u0637 \u0648\u062d\u062f\u0647\u0627). */
const OMRAN_CT_LINE = /^\s*\[\[CONTACT:\s*(.*)\]\]\s*$/i;
function omranCtItem(body){
  const f = String(body || '').split('|').map(function(x){ return x.replace(/\s+/g, ' ').trim(); });
  const name = f[0] || '', phone = f[1] || '';
  if(!name || (phone.match(/[0-9\u0660-\u0669\u06f0-\u06f9]/g) || []).length < 3) return null;
  const rest = f.slice(3).join('|').trim();
  const ml = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(rest);
  const mu = !ml && /https?:\/\/[^\s)\]]+/.exec(rest);
  const src = ml ? { label: ml[1].trim(), url: ml[2] } : (mu ? { label: '', url: mu[0] } : (rest ? { label: rest, url: '' } : null));
  return { name: name, phone: phone, area: f[2] || '', src: src };
}
/** حقل الرقم قد يحمل رقمين («04 555 4321 / 800 2384»): كلّ رقم وحده (لا يُقسم الرقم نفسه). */
function omranCtNums(phone){
  const parts = String(phone || '').split(/\s*(?:\/|,|،|;|؛|\s(?:أو|او|or)\s)\s*/).map(function(x){ return x.trim(); }).filter(function(x){ return (x.match(/[0-9٠-٩۰-۹]/g) || []).length >= 3; });
  return parts.length ? parts : [String(phone || '').trim()];
}
function omranSpeechNoCt(text){
  const s = String(text || '');
  if(!/\[\[CONTACT:/i.test(s)) return text;
  const z = String.fromCharCode(0x2060);
  return s.split('\n').map(function(l){ return OMRAN_CT_LINE.test(l) ? l.replace(/\S+/g, z) : l; }).join('\n');
}
function omranBlocksCss(){
  if(document.getElementById('omranBlocksCss')) return;
  const st = document.createElement('style');
  st.id = 'omranBlocksCss';
  st.textContent = '.md-contacts{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:8px 0 12px;width:100%;align-self:stretch;box-sizing:border-box;}'
    + 'html.mobile-ui .md-contacts{grid-template-columns:1fr;}'
    + '.md-ct{display:flex;flex-direction:column;gap:3px;min-width:0;padding:12px 14px;border-radius:var(--r-3,14px);background:rgba(127,127,127,.10);box-sizing:border-box;text-align:start;}'
    + '.msg-text .md-contacts,.msg-text .md-contacts div{unicode-bidi:isolate;}' /* plaintext الموروث (.msg-text div) يحاذي الاسم اللاتينيّ يسارًا والمنطقة يمينًا — البطاقة تتبع dir الكتلة */
    + 'html body .msg .md-table a.md-src.md-src,.md-table .md-src{max-width:8.5em;min-width:0;padding:2px 7px;font-size:11.5px;}' /* أعلى من قاعدة الشارة العامّة وإلّا عرّض الجدول خارج الفقاعة */
    + 'html[data-mode="light"] .md-ct{background:#f3f4f8;}'
    + '.md-ct-name{font-size:14.5px;font-weight:800;line-height:1.35;color:var(--text,#eee);overflow-wrap:anywhere;}'
    + '.md-ct-num{display:flex;flex-wrap:wrap;column-gap:12px;font-size:22px;font-weight:800;line-height:1.35;color:var(--text,#eee);font-variant-numeric:tabular-nums;}'
    + '.md-ct-num bdi,.md-ltr{unicode-bidi:isolate;white-space:nowrap;}'
    + '.md-ct-area{font-size:12.5px;color:var(--muted,#9aa3b2);}'
    + '.md-ct-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:7px;}'
    + '.md-ct-copy{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border:0;border-radius:999px;background:rgba(127,127,127,.18);color:var(--text,#eee);font:inherit;font-size:12.5px;font-weight:700;line-height:1.4;cursor:pointer;}'
    + '.md-ct-copy::before{content:"";width:9px;height:10px;border:1.6px solid currentColor;border-radius:2px;box-shadow:-3px 3px 0 -1.6px currentColor;}'
    + '.md-ct-copy.ok{background:rgba(127,127,127,.34);}'
    + 'html body .msg a.md-src.md-src,.md-src{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:3px 9px;border-radius:999px;background:rgba(127,127,127,.16);color:var(--muted,#9aa3b2) !important;font-size:12px;font-weight:600 !important;line-height:1.5;text-decoration:none !important;vertical-align:middle;white-space:nowrap;overflow:hidden;}'
    + 'html body .msg a.md-src.md-src:hover{color:var(--text,#eee) !important;}'
    + '.md-src img{width:14px;height:14px;border-radius:3px;flex:0 0 auto;}'
    + '.md-src span{overflow:hidden;text-overflow:ellipsis;min-width:0;}';
  document.head.appendChild(st);
}
/** \u0634\u0627\u0631\u0629 \u0627\u0644\u0645\u0635\u062f\u0631: \u0623\u064a\u0642\u0648\u0646\u0629 \u0627\u0644\u0645\u0648\u0642\u0639 + \u0627\u0633\u0645\u0647 (\u0623\u0648 \u0646\u0637\u0627\u0642\u0647)\u060c \u0631\u0627\u0628\u0637 \u064a\u0641\u062a\u062d \u0641\u064a \u0635\u0641\u062d\u0629 \u062c\u062f\u064a\u062f\u0629\u061b \u0628\u0644\u0627 \u0631\u0627\u0628\u0637 = \u0627\u0633\u0645 \u0641\u0642\u0637. */
function omranSrcChip(url, label){
  omranBlocksCss();
  let host = '';
  if(/^https?:\/\//i.test(String(url || ''))){ try{ host = new URL(url).hostname.replace(/^www\./, ''); }catch(e){ host = ''; } }
  const c = document.createElement(host ? 'a' : 'span');
  c.className = 'md-src';
  if(host){
    c.href = url; c.target = '_blank'; c.rel = 'noopener noreferrer'; c.title = host;
    const fav = document.createElement('img');
    fav.src = 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(host); fav.alt = ''; fav.loading = 'lazy'; fav.referrerPolicy = 'no-referrer';
    fav.onerror = function(){ fav.style.display = 'none'; };
    c.appendChild(fav);
  }
  const tx = document.createElement('span'); tx.textContent = String(label || host || ''); c.appendChild(tx);
  return c;
}
function omranCopyNum(num, btn){
  const v = String(num || '').trim();
  const flash = function(ok){
    try{ if(typeof settingsToast === 'function') settingsToast(t(ok ? 'copiedToast' : 'msgCopyFailed')); }catch(e){ __swallow(e, 'ct:toast'); }
    if(ok && btn){ btn.classList.add('ok'); setTimeout(function(){ btn.classList.remove('ok'); }, 1400); }
  };
  const legacy = function(){
    try{
      const ta = document.createElement('textarea'); ta.value = v; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); flash(ok);
    }catch(e){ __swallow(e, 'ct:copy'); flash(false); }
  };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(function(){ flash(true); }, legacy);
  else legacy();
}
function omranContactsEl(it){
  omranBlocksCss();
  const g = document.createElement('div');
  g.className = 'md-contacts';
  g.setAttribute('contenteditable', 'false');
  g.setAttribute('dir', /[ؠ-يٮ-ۓۺ-ۿݐ-ݿ]/.test(it.items.map(function(c){ return c.name + ' ' + c.area; }).join(' ')) ? 'rtl' : 'ltr');
  it.items.forEach(function(c){
    const card = document.createElement('div'); card.className = 'md-ct';
    const nm = document.createElement('div'); nm.className = 'md-ct-name'; nm.textContent = c.name; card.appendChild(nm);
    const num = document.createElement('div'); num.className = 'md-ct-num';
    omranCtNums(c.phone).forEach(function(p){ const b = document.createElement('bdi'); b.setAttribute('dir', 'ltr'); b.textContent = p; num.appendChild(b); }); // رقمان في الحقل سطران لا خروج من البطاقة
    card.appendChild(num);
    if(c.area){ const ar = document.createElement('div'); ar.className = 'md-ct-area'; ar.textContent = c.area; card.appendChild(ar); }
    const acts = document.createElement('div'); acts.className = 'md-ct-acts';
    const cp = document.createElement('button'); cp.type = 'button'; cp.className = 'md-ct-copy'; cp.textContent = t('copyCode');
    cp.onclick = function(e){ if(e && e.stopPropagation) e.stopPropagation(); omranCopyNum(c.phone, cp); };
    acts.appendChild(cp);
    if(c.src && (c.src.url || c.src.label)) acts.appendChild(omranSrcChip(c.src.url, c.src.label));
    card.appendChild(acts);
    g.appendChild(card);
  });
  return g;
}
function buildSpokenWordSpans(container, text){
  let __im = { text: text, list: [] };
  try{ __im = omranMdImgMark(text); text = __im.text; }catch(e){ __swallow(e, 'md:img-mark'); } // v-rich-reply: سطر الصور معرض
  let __tb = { text: text, list: [] };
  try{ __tb = omranMdTableMark(text); }catch(e){ __swallow(e, 'md:table-mark'); } // v-gpt-format: الجدول الكامل يُرسم جدولًا
  text = mdTablesToLines(__tb.text); // v-md-table: جدول بلا سطر فاصل يبقى سطورًا كما كان
  // بعض الردود تفصل عنوان المصدر عن رابطه بسطر جديد:
  // [عنوان المصدر]\nhttps://example.com — نعيده إلى ماركداون صالح
  // قبل التقسيم كي يصير رابطًا نظيفًا ويُجمع تحت زر «المصادر».
  text = String(text || '').replace(/\[([^\]\n]{1,240})\]\s*\n+\s*\(?\s*(https?:\/\/[^\s)]+)\s*\)?/g, '[$1]($2)');
  // v-chat-math: المعادلة رمز حارس واحد قبل جمع الأسطر (حارس «لا سطر فارغ داخل $$» يرى الأسطر الأصليّة)
  let __math = { list: [] };
  try{ __math = omranMathMark(text); text = __math.text; }catch(e){ __math = { list: [] }; __swallow(e, 'md:math-mark'); }
  // v-tidy-gaps (أمر عمران «الأسطر متباعدة، كل واحد بعيد عن الثاني»): اجمع الأسطر
  // الفارغة بين الفقرات (سطر فارغ ⇐ سطر واحد) فتقترب الفقرات وتصير مرتّبة. خارج كتل
  // الكود فقط (```…``` أو المفتوحة أثناء البثّ) كي لا ينهار تنسيق الكود.
  text = text.split(/(```[\s\S]*?```|```[\s\S]*$)/g).map(function(__s, __i){
    return (__i % 2) ? __s : __s.replace(/\n{2,}/g, '\n');
  }).join('');
  container.innerHTML = '';
  const wordEls = [];
  // v467: capture markdown links [text](url) — even with spaces — as a single token
  // v541: **[نص](رابط)** كان ينكسر لأن ** تسبق [ فتُقسَّم على المسافات
  const re = /[^\s\[!\x60]*(?:\*\*)?\[[^\]]*\]\(https?:\/\/[^\s)]+\)(?:\*\*)?[.,،؛!؟)]*|\S+/g;
  let m, lastIndex = 0;
  let boldOpen = false;
  const __ic = { open: false }; // v-gpt-format: كود مضمّن مفتوح بين الكلمات
  let headerLevel = 0; // >0 while inside a "## ..." heading line
  let lineStart = true; // v-md-list: هل التوكن الحالي أول توكن في سطره؟
  let parent = container;    // where tokens/text currently get appended
  let codePre = null;        // non-null while inside a ``` fenced code block
  /* v-chat-math: يُلحق نصًّا فيه رموز حارسة: النصّ عقدًا، وكلّ معادلة عنصرها المرسوم (أو مصدرها خامًا إن تعثّر
     الرسم — لا يسقط رسم المحادثة كلّها)، ويعدّ كلماتها الزائدة كي تُلحق بعد العنصر spans مخفيّة. */
  let __mathExtra = 0;
  const __appendMath = (el, str) => {
    str.split(/\uE000(\d+)\uE001/).forEach((p, i) => {
      if(!(i % 2)){ if(p) el.appendChild(document.createTextNode(p)); return; }
      const it = __math.list[+p];
      if(!it) return;
      let node = null;
      try{ node = omranMathEl(it); }catch(e){ __swallow(e, 'md:math-el'); }
      el.appendChild(node || document.createTextNode(it.raw));
      __mathExtra += it.extra;
    });
  };
  // توكن فيه حارس لكنّه يُكتب نصًّا (كود يراه المقطّع ولم يره الالتقاط، أو رابط) ⇐ يعود مصدره خامًا ويُعدّ ما ابتلعه
  const __unmark = (str) => !__math.list.length ? String(str) : String(str).replace(/\uE000(\d+)\uE001/g, (x, n) => { const it = __math.list[+n]; if(!it) return x; __mathExtra += it.extra; return it.raw; });
  // كلمات المعادلة الزائدة spans مخفيّة بترتيبها (om-math-x) — عدد tts-word = كلمات الردّ
  const __flushExtra = (el) => { for(; __mathExtra > 0; __mathExtra--){ const __h = document.createElement('span'); __h.className = 'tts-word om-math-x'; __h.style.display = 'none'; el.appendChild(__h); wordEls.push(__h); } };
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
  const closeCodeBlock = () => {
    /* v-code-color (المالك «الكود غير ملوّن»): الكتلة المكتملة تُلوَّن بملوّن المحرّر نفسه
       (omranCodeHighlight) — يُستبدل النصّ العاديّ بوسوم <i> ملوّنة (كلمات مفتاحيّة/نصوص/
       تعليقات/أرقام). القراءة الصوتيّة لا تقرأ الكود عادةً فلا يضرّ فقد وسوم tts-word هنا. */
    try{
      if(codePre && typeof omranCodeHighlight === 'function'){
        var __raw = codePre.textContent.replace(/^[ \t]*\n+/, ''); // v-md-blocks: لا أسطر فارغة أعلى صندوق الكود
        if(__raw){ var __hl = omranCodeHighlight(__raw); if(__hl) codePre.innerHTML = __hl; }
      }
    }catch(e){ /* يبقى النصّ عاديًّا عند أيّ تعثّر */ }
    codePre = null; parent = container;
  };
  while((m = re.exec(text))){
    if(m.index > lastIndex){
      const between = text.slice(lastIndex, m.index);
      if(__ic.open && !codePre && between.indexOf('\n') === -1){ const __g = document.createElement('span'); __g.className = 'md-ic md-ic-gap'; __g.textContent = between; parent.appendChild(__g); } // v-gpt-format
      else { if(between.indexOf('\n') !== -1) __ic.open = false; parent.appendChild(document.createTextNode(between)); }
      if(between.indexOf('\n') !== -1){ headerLevel = 0; lineStart = true; }
    }
    const __imm = !codePre && /^\uE004(\d+)\uE005$/.exec(m[0]);
    if(__imm){ // v-rich-reply: المعرض كتلة، وكلمات سطره عناصر مخفيّة داخله
      const __g = __im.list[+__imm[1]];
      if(__g){
        const __w = __g.kind === 'contact' ? omranContactsEl(__g) : omranGalleryEl(__g); // v-reply-blocks
        for(let __k = 0; __k < __g.extra; __k++){ const __h = document.createElement('span'); __h.className = 'tts-word'; __h.style.display = 'none'; __w.appendChild(__h); wordEls.push(__h); }
        container.appendChild(__w);
      }
      lastIndex = m.index + m[0].length; lineStart = true;
      continue;
    }
    const __tbm = !codePre && /^\uE002(\d+)\uE003$/.exec(m[0]);
    if(__tbm){ // v-gpt-format: الجدول كتلة، وكلماته القديمة عناصر مخفيّة داخله
      const __t = __tb.list[+__tbm[1]];
      if(__t){
        const __w = omranMdTableEl(__t);
        for(let __k = 0; __k < __t.extra; __k++){ const __h = document.createElement('span'); __h.className = 'tts-word'; __h.style.display = 'none'; __w.appendChild(__h); wordEls.push(__h); }
        container.appendChild(__w);
      }
      lastIndex = m.index + m[0].length; lineStart = true;
      continue;
    }
    if(/^```/.test(m[0])){
      // fence token: hide it, toggle code mode (span kept so TTS word mapping stays aligned)
      const fSpan = document.createElement('span');
      fSpan.className = 'tts-word';
      fSpan.style.display = 'none';
      container.appendChild(fSpan);
      wordEls.push(fSpan);
      const __ft = __unmark(m[0]); // علامة الكود فاتحةً أو غالقة: ما التصق بها من معادلة يعود خامًا ويُعدّ
      if(codePre) closeCodeBlock(); else openCodeBlock(__ft.slice(3));
      __flushExtra(container);
      lastIndex = m.index + m[0].length;
      continue;
    }
    if(codePre){
      const cSpan = document.createElement('span');
      cSpan.className = 'tts-word';
      cSpan.textContent = __unmark(m[0]);
      parent.appendChild(cSpan);
      wordEls.push(cSpan);
      __flushExtra(parent);
      lastIndex = m.index + m[0].length;
      continue;
    }
    const token = m[0];
    const __atStart = lineStart; lineStart = false;
    const span = document.createElement('span');
    span.className = 'tts-word';
    if(__atStart && headerLevel === 0 && /^(?:-{3,}|\*{3,}|_{3,})$/.test(token) && /^[ \t]*(?:\n|$)/.test(text.slice(m.index + token.length))){
      // v-chat-math: سطر «---» أو «***» أو «___» وحده خطّ فاصل (omranMdBlocks ← md-hr). «***» كان يصير نقطة
      // ويقلب الخطّ العريض لبقيّة الردّ لأنّ ** تُنزع منه أوّلًا.
      span.textContent = token;
      span.style.display = 'none';
      span.className += ' md-hr-mk';
    } else if(headerLevel === 0 && /^#{1,6}$/.test(token)){
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
      /* v-md-list (شكوى عمران — «-مرجان» ملتصقة والشرطات تقفز): علامة
         القائمة «- » أول السطر كانت تبقى شرطة خام، وبيدي السطر المخلوط
         عربي/لاتيني يبعثر مكانها. تصير نقطة حقيقية معزولة الاتجاه، سواء
         جاءت منفصلة («- بند») أو ملتصقة بالكلمة («-مرجان»). */
      if(__atStart && headerLevel === 0){
        if(/^[-*+•]$/.test(display)){
          display = '•'; span.style.unicodeBidi = 'isolate';
        } else if(/^[-•][؀-ۿݐ-ݿA-Za-z]/.test(display)){
          display = '• ' + display.slice(1); span.style.unicodeBidi = 'isolate';
        }
      }
      // 🔗 clickable links: markdown [text](url) or plain URLs
      // v467: الرابط المسبوق بقوس أو علامة اقتباس — (https://…) أو «https://…» —
      // كان يسقط من الالتقاط فيخرج نصًّا يُنسخ باليد. نفصل البادئة، ونوسّع
      // اللاحقة لتشمل : » " ' ] التي تلتصق بنهايات الروابط في النصّ العربي.
      const __icDone = omranIcTok(span, display, __ic); // v-gpt-format: `كود` رقاقة لا علامات خامّة
      let __lead = '';
      // v476: «[نص](رابط)» كان يبدأ بـ"[" فتقتطعه بادئةُ v467 فينكسر الماركداون
      // ويظهر «النص](الرابط)» ملتصقًا. نتخطّى الاقتطاع متى كان التوكن رابطَ ماركداون.
      if(__math.list.length && display.indexOf('\uE000') >= 0) display = display.replace(/\[[^\]]*\]\(https?:\/\/[^\s)]+\)/g, (lk) => __unmark(lk)); // v-chat-math: حارس داخل رابط ⇐ مصدره خامًا
      const __isMd = /^\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(display);
      const __leadM = __isMd ? null : (display.match(/^([^\[!\x60]+)(?=\[[^\]]+\]\(https?:\/\/)/) || display.match(/^[(«"'\[]+(?=(?:\[|https?:\/\/|www\.))/));
      if(__leadM){ __lead = __leadM[0]; display = display.slice(__lead.length); }
      const linkM = display.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)([.,،؛:!؟)»"'\]]*)$/);
      const __noMath = !__math.list.length || display.indexOf('\uE000') < 0; // v-chat-math: توكن فيه معادلة لا يصير رابطًا (لا يتسرّب الرمز الحارس إلى الرابط)
      const urlM = !linkM && __noMath && display.match(/^(https?:\/\/[^\s<>"']{4,}|www\.[^\s<>"']{4,})([.,،؛:!؟)»"'\]]*)$/);
      // v-bare-link (طلب المالك «أعطاني موقع أريده رابطًا لا اسمًا»):
      // النطاق العاري بلا http (مثل github.com أو example.com/path) يصبح رابطًا.
      // نستثني امتدادات الملفات (app.js، style.css…) كي لا تُحوَّل أسماء الملفات لروابط.
      const __fileExt = /^(js|mjs|cjs|jsx|ts|tsx|css|scss|sass|less|html|htm|json|xml|yml|yaml|md|txt|py|rb|go|rs|java|c|h|cpp|cc|php|sql|csv|tsv|sh|bash|zsh|vue|svelte|toml|ini|conf|cfg|env|lock|log|bak|png|jpg|jpeg|gif|svg|webp|ico|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz|rar|7z|exe|dll|bin|dmg|apk|mp3|mp4|mov|avi|wav|woff|woff2|ttf|eot|map)$/i;
      let bareM = null;
      if(!linkM && !urlM && __noMath){
        bareM = display.match(/^((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})((?:\/[^\s]*?)?)([.,،؛:!؟)»"'\]]*)$/i);
        if(bareM){
          const __segs = bareM[1].split('.');
          const __tld = __segs[__segs.length - 1];
          // امتداد ملف بلا مسار ⇐ ليس رابطًا (اسم ملف)
          if(!bareM[2] && __fileExt.test(__tld)) bareM = null;
        }
      }
      if(__icDone){ /* v-gpt-format: الكلمة رُسمت كودًا مضمّنًا — لا رابط داخلها */ }
      else if(linkM || urlM || bareM){
        if(__lead) __appendMath(span, __lead);
        const rawUrl = linkM ? linkM[2] : (urlM ? urlM[1] : bareM[1] + bareM[2]);
        const href = (rawUrl.indexOf('www.') === 0 || bareM) ? 'https://' + rawUrl : rawUrl;
        const a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        // v-full-links (المالك ١٥ أكتوبر «الموقع يعطيني الرئيس فقط — أريده كاملًا لكلّ المزوّدين»): كان v-clean-links
        // يعرض الرابط باسم نطاقه فقط (github.com) فلا يُعرف أيّ طلب أو صفحة. الآن الرابط كاملًا كما كُتب، مفكوك الترميز
        // (%D8%A3… ← عربيّ مقروء، وهو ما كان v-clean-links يعالجه) وword-break يلفّه. ونصّ ماركداون هو اسم نطاق رابطه
        // ([github.com](https://github.com/…)) يُعرض رابطه كاملًا؛ وغيره من النصوص يبقى كما كتبه المزوّد.
        const __decode = function(u){ try { return decodeURIComponent(u); } catch(e){ return u; } };
        const __hostOf = function(u){ try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return ''; } };
        let __disp = linkM ? linkM[1] : rawUrl;
        if(bareM){ __disp = rawUrl; } // النطاق ومساره كما كُتبا
        else if(!linkM || __disp.replace(/^www\./, '').toLowerCase() === __hostOf(href).toLowerCase()) __disp = __decode(rawUrl);
        a.textContent = __disp;
        a.title = href;
        a.setAttribute('dir', 'auto'); // v476 bidi
        /* v-link-wrap (لقطتا المالك من آيفون ١٦ أكتوبر: «https://www.d» ثمّ «ecathlon.ae» في السطر التالي): break-all هنا كان يغلب قاعدة v569
           في tokens.css (.msg a{word-break:normal; overflow-wrap:break-word}) فيُكسر الرابط عند أيّ حرف. لم يظهر قبل v-full-links لأنّ
           الرابط كان اسم نطاقه القصير؛ صار كاملًا فانكسر في منتصفه. الآن ينتقل كاملًا للسطر التالي، ويُكسر فقط إن كان أطول من السطر. */
        a.style.cssText = 'color:var(--om-hl,#e3b341); text-decoration:underline; unicode-bidi:isolate;'; /* v-hl-yellow: الروابط صفراء (طلب المالك) */
        span.appendChild(a);
        const trail = linkM ? linkM[3] : (urlM ? urlM[2] : bareM[3]);
        if(trail) span.appendChild(document.createTextNode(trail));
      } else {
        const __full = __lead + display;
        if(!__math.list.length || __full.indexOf('\uE000') < 0) span.textContent = __full;
        else {
          __appendMath(span, __full);
          span.classList.add('md-math');
          // «$x$-axis» و«25$^\circ$C،»: نصّ لاتينيّ أو رقميّ ملتصق بالمعادلة يُعزل معها كي لا يقلبه السطر العربيّ («C°25»)،
          // بغلاف داخل التوكن نفسه (عنصر tts-word واحد)، وترقيم آخره (، . ؛) يبقى خارج العزل في مكانه من الجملة العربيّة
          omranMathIsoTok(span);
        }
        /* v-hl-links-only (طلب المالك: الإنجليزي والأرقام بيضاء عاديّة، الأصفر
           للروابط فقط): لم نعد نضع الصنف om-en على الكلمات اللاتينيّة — يبقى
           لونها كبقيّة النصّ. الأصفر محصور في الرابط <a> فقط. */
      }
      if(wasBold || markerCount) span.classList.add('md-bold');
      if(headerLevel) span.classList.add('md-h' + headerLevel);
    }
    container.appendChild(span);
    wordEls.push(span);
    // v-chat-math: كلمات المعادلة الزائدة ($1s^2, 2s^2$ كلمتان في الردّ الخامّ) spans مخفيّة بترتيبها — عدد tts-word = كلمات الردّ
    __flushExtra(container);
    lastIndex = m.index + m[0].length;
  }
  if(lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
  const __lines = omranMdBlocks(container, text); // v-md-blocks
  // v476: عزل الاتجاه — «(+9714) 708 1111» داخل جملة عربية كان يُعرض معكوسًا
  // لأن المسافات بين الأرقام تتبع اتجاه الفقرة. نلفّ كل تتابع لاتيني/رقمي
  // متجاور في غلاف dir=ltr معزول. لا يغيّر عدد spans فمحاذاة TTS تبقى سليمة.
  try{
    /* v-bidi-punct (لقطة المالك ١٣ سبتمبر: «BuilderOmran AI»): الفاصلة العربيّة
       الملتصقة بآخر كلمة لاتينيّة («Builder،») كانت تُحسب عربيّة فتُقطع سلسلة
       الكلمات اللاتينيّة قبلها ويُعكس ترتيبها. العربيّة هنا حروفها وأرقامها فقط —
       لا علامات الترقيم (، ؛ ؟) ولا الحركات. */
    const __RTL = /[\u0620-\u065f\u0660-\u0669\u066e-\u06d3\u06d5\u06fa-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/, __LTR = /[0-9A-Za-z]/;
    const __GLUE = /^[\s\u00a0()\[\]{}.,:;+\-\/\\#*'"]*$/;
    let __run = [];
    const __flush = () => {
      // v-chat-math: كلمات المعادلة المخفيّة (tts-word بلا نصّ) تُنقل مع السلسلة ولا تُحسب في طولها — وإلّا
      // لُفّت «$1s^2, 2s^2$،» مع فاصلتها ومسافتها فانتقلت الفاصلة إلى الجهة الخطأ
      if(__run.filter((n) => !(n.nodeType === 1 && /\bom-math-x\b/.test(n.className))).length > 2){
        const w = document.createElement('span');
        w.setAttribute('dir', 'ltr');
        w.style.unicodeBidi = 'isolate';
        __run[0].parentNode.insertBefore(w, __run[0]);
        __run.forEach(n => w.appendChild(n));
      }
      __run = [];
    };
    for(const __blk of __lines){
      for(const n of Array.from(__blk.childNodes)){
        const t = n.textContent || '';
        if(__RTL.test(t) || (n.nodeType === 1 && n.className === 'chat-codeblock')) __flush();
        else if(__LTR.test(t) || (__run.length && __GLUE.test(t))) __run.push(n);
        else __flush();
      }
      __flush();
    }
  }catch(e){ __swallow(e, 'bidi:isolate'); }
  return wordEls;
}
/* v-md-blocks (المالك ٢٣ سبتمبر: «الكتابة غير نظاميّة وغير مرتّبة في أوقات»): الردّ كان نصًّا واحدًا بـpre-wrap
   وunicode-bidi:plaintext — كلّ سطر يأخذ اتّجاهه من أوّل حرف قويّ فيه، فسطر يبدأ بكلمة إنجليزيّة أو رقم
   («3. Zuma Dubai — التقييم 4.5») ينقلب يسارًا ويتبعثر ترتيبه، ورقم القائمة يقفز لطرف السطر الآخر. الآن كلّ سطر
   كتلة مستقلّة باتّجاه صريح: اتّجاه الردّ كلّه (عربيّ إن غلب العربيّ)، إلّا سطرًا إنجليزيًّا خالصًا فيبقى يسارًا.
   علامة القائمة (• أو 1.) تُعلَّق في بداية السطر بمسافة ثابتة، والعنوان كتلة لها هامش. العناصر نفسها (tts-word)
   وترتيبها لا يتغيّران، فتمييز القراءة الصوتيّة يبقى كما هو. */
const OMRAN_AR_CHARS = /[ؠ-يٮ-ۓۺ-ۿݐ-ݿ]/g;
function omranMdBlocks(container, text){
  const arN = (String(text).match(OMRAN_AR_CHARS) || []).length;
  const laN = (String(text).match(/[A-Za-z]/g) || []).length;
  const baseRtl = arN > 0 && arN * 2 >= laN;
  const nodes = Array.prototype.slice.call(container.childNodes);
  nodes.forEach(function(n){ container.removeChild(n); });
  const out = [];
  let cur = null;
  const newLine = function(){ cur = document.createElement('div'); cur.className = 'md-line'; out.push(cur); };
  newLine();
  nodes.forEach(function(n){
    if(n.nodeType === 1 && n.className === 'md-contacts'){ out.push(n); newLine(); return; } // v-reply-blocks: بطاقات التواصل كتلة كالمعرض
    if(n.nodeType === 1 && (n.className === 'chat-codeblock' || n.className === 'md-table-wrap' || n.className === 'md-gallery')){ out.push(n); newLine(); return; } // v-gpt-format: الجدول كتلة · v-rich-reply: والمعرض
    if(n.nodeType === 3){
      const parts = String(n.textContent).split('\n');
      parts.forEach(function(p, i){
        if(i > 0) newLine();
        if(p && (cur.childNodes.length || p.trim())) cur.appendChild(document.createTextNode(p));
      });
      return;
    }
    cur.appendChild(n);
  });
  const lines = [];
  out.forEach(function(b){
    if(b.className !== 'md-line'){ container.appendChild(b); return; }
    if(!b.childNodes.length) return;
    const t = b.textContent || '';
    const hasAr = /[ؠ-يٮ-ۓۺ-ۿݐ-ݿ]/.test(t);
    const la = (t.match(/[A-Za-z]/g) || []).length;
    const rtl = baseRtl ? (hasAr || la < 12) : (hasAr && !la);
    b.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    let fv = null;
    const kids = Array.prototype.slice.call(b.childNodes);
    for(let i = 0; i < kids.length; i++){
      const k = kids[i];
      if(k.nodeType === 1 && k.style.display !== 'none' && String(k.textContent).trim()){ fv = k; break; }
      if(k.nodeType === 3 && String(k.textContent).trim()) break;
    }
    let cls = 'md-line';
    if(!fv && kids.some(function(k){ return k.nodeType === 1 && /\bmd-hr-mk\b/.test(k.className); })) cls += ' md-hr'; // v-chat-math
    if(fv){
      const ft = String(fv.textContent).trim();
      if(/\bmd-h\d\b/.test(fv.className)) cls += ' md-hb';
      else if(ft === '•'){ cls += ' md-li'; fv.className += ' md-mk'; }
      else if(/^•\s/.test(ft)) cls += ' md-li md-li-glued';
      else if(/^(?:[0-9]{1,3}|[٠-٩]{1,3})[.)]$/.test(ft)){ cls += ' md-oli'; fv.className += ' md-mk'; }
    }
    b.className = cls;
    container.appendChild(b);
    lines.push(b);
  });
  return lines;
}
function wordStartOffsets(text){
  const offsets = [];
  const re = /\S+/g;
  let m;
  while((m = re.exec(text))) offsets.push(m.index);
  return offsets;
}
function stopAllSpeaking(){
  currentCloudToken = null; // v-tts-free: مقطع كان قيد الجلب لا يبدأ بعد «إيقاف» (ولا صوت الجهاز البديل)
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  if(currentCloudAudio){ try{ currentCloudAudio.pause(); }catch(e){ __swallow(e, "misc:app-02-tts#2"); } currentCloudAudio = null; }
  if(ttsHighlightRaf){ cancelAnimationFrame(ttsHighlightRaf); ttsHighlightRaf = null; }
  clearWordHighlight();
  ttsHighlightWordEls = null;
}
/* v-reply-voice-speed (طلب المالك ٢٢ سبتمبر «خاصيّة بطيء وسريع… أريدها لمها والصوت الي عند المحادثة في الردود»):
   سرعة الصوت في الإعدادات كانت تصل مها وحدها؛ «استمع» على الردود وقراءتها التلقائيّة وزرّ «تجربة الصوت» كانت
   بالسرعة العاديّة دائمًا. المفتاح نفسه (aiapp_maha_voice_speed) والدرجات الأربع نفسها، وقيمة تالفة = عاديّ. */
function ttsSpeedSetting(){
  try{
    const v = localStorage.getItem('aiapp_maha_voice_speed');
    return (v === 'slow' || v === 'fast' || v === 'xfast') ? v : 'normal';
  }catch(e){ return 'normal'; }
}
/* v-tts-account (المالك: «ابدا فيهم كلهم»): صوت القراءة كان يطلب /api/tts بلا حساب فيُعدّ على عنوان IP —
   المالك نفسه يُحدّ بستّين طلبًا في اليوم، ومن يتشاركون شبكة يتشاركونها. الحساب يُرسل الآن: المالك وVIP بلا حدّ،
   وكلّ حساب حصّته، والضيف على عنوانه كما كان. مها الأساسيّ وتأكيد تبويب الصوت يستعملان المساعدين نفسيهما. */
function ttsAuthToken(){
  try{ return (typeof authGet === 'function' ? authGet('aiapp_auth_token') : '') || ''; }catch(e){ return ''; }
}
function ttsGuestId(){
  try{ return (typeof window !== 'undefined' && typeof window.getGuestId === 'function') ? (window.getGuestId() || '') : ''; }catch(e){ return ''; }
}
async function fetchCloudSpeech(text){
  // v246: دائمًا صوت Azure Neural عالي الجودة (نفس مسار مها) — الجنس من إعداد
  // المستخدم واللغة تُكتشف تلقائيًا من النص لدقة نطق أعلى في كل اللغات.
  const gender = localStorage.getItem('aiapp_voice_gender') || 'female';
  const detected = detectSpeechLang(String(text));
  const resp = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice: 'maha', gender, lang: detected, token: ttsAuthToken(), guestId: ttsGuestId(), text: String(text).slice(0, 4000), speed: ttsSpeedSetting() })
  });
  if(!resp.ok){
    let msg = 'cloud-tts-failed:' + resp.status;
    try{ const j = await resp.json(); if(j && j.error) msg = j.error; }catch(e){ __swallow(e, "misc:app-02-tts#3"); }
    throw new Error(msg);
  }
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}
// Splits text into speakable chunks (the first ≈ one sentence, the rest merged
// to ~160–400 chars) so cloud TTS can start playing the first chunk almost
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
    /* v-tts-free: المقطع الأوّل قصير كما كان فيبدأ الصوت فورًا، وما بعده جمل مجموعة (١٦٠–٤٠٠ حرف): الردّ ذو الأسطر
       القصيرة كان طلبًا لكلّ سطر، فيتجاوز حدّ الباقة المجّانيّة (٢٠ طلبًا في الدقيقة) ويأكل حصّة اليوم (٦٠ طلبًا). */
    const minLen = chunks.length ? 160 : 20;
    const maxLen = chunks.length ? 400 : 180;
    if(isLast || (endsSentence && buf.length >= minLen) || buf.length >= maxLen){
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
let deviceSpeechUnlocked = false;
function unlockCloudAudio(){
  try{
    if(!cloudAudioEl) cloudAudioEl = new Audio();
    // wav صامت قصير جدًا — تشغيله داخل الضغطة "يفتح" العنصر للتشغيل لاحقًا
    cloudAudioEl.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    const p = cloudAudioEl.play();
    if(p && p.catch) p.catch(()=>{});
  }catch(e){ __swallow(e, "misc:app-02-tts#4"); }
  /* v-tts-free: آيفون لا ينطق بصوت الجهاز إلّا بعد نطق بدأ داخل ضغطة — نطق صامت مرّة واحدة هنا يفتح صوت الجهاز
     البديل الذي يبدأ لاحقًا بعد جلب مرفوض (خارج الضغطة). القراءة التلقائيّة ليست ضغطة فلا تستهلك الفتح. */
  const __ua = (typeof navigator !== 'undefined' && navigator.userActivation) || null;
  if(!deviceSpeechUnlocked && (!__ua || __ua.isActive)){
    try{
      if('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'){
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
        deviceSpeechUnlocked = true;
      }
    }catch(e){ __swallow(e, 'tts:device-unlock'); }
  }
}
/* v-tts-sync: وزن الكلمة ≈ زمن نطقها — الحروف بلا تشكيل، والرقم أطول نطقًا (٣ لكلّ خانة)، وعلامة الوقف تضيف وقفة. */
function ttsWordWeight(w){
  const s = String(w || '');
  const letters = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[^\p{L}]/gu, '').length;
  const digits = (s.match(/[0-9\u0660-\u0669]/g) || []).length;
  return Math.max(1, letters + digits * 3);
}
function ttsWeightStarts(els, t0, t1){
  const ws = els.map(el => ttsWordWeight(el.textContent));
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return ws.map(w => { const s = t0 + (acc / total) * (t1 - t0); acc += w; return s; });
}
/* أزمنة الكلمات من الصوت: غلاف الطاقة (١٠م.ث) ← المقاطع المسموعة (الصمت ≥ ١٢٠م.ث وقفة) ← الكلمات تُوزَّع على زمن
   الكلام وحده بأوزانها، فالتظليل يثبت أثناء الوقفة ويبدأ مع أوّل صوت لا مع أوّل الملفّ. */
let ttsSyncCtx = null;
async function ttsVoicedStarts(url, els){
  const C = window.AudioContext || window.webkitAudioContext;
  if(!C || !els.length) return null;
  if(!ttsSyncCtx) ttsSyncCtx = new C();
  const ab = await (await fetch(url)).arrayBuffer();
  const buf = await new Promise((res, rej) => { const p = ttsSyncCtx.decodeAudioData(ab, res, rej); if(p && p.then) p.then(res, rej); });
  const ch = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.max(1, Math.round(sr / 100));
  const env = [];
  for(let a = 0; a < ch.length; a += hop){
    let e = 0; const z = Math.min(ch.length, a + hop);
    for(let k = a; k < z; k++) e += ch[k] * ch[k];
    env.push(Math.sqrt(e / Math.max(1, z - a)));
  }
  const peak = env.reduce((m, v) => v > m ? v : m, 0);
  if(!peak) return null;
  const thr = peak * 0.06;
  const voiced = env.map(v => v > thr);
  // وقفة أقصر من ١٢٠م.ث داخل كلمة/بين كلمتين متّصلتين تُحسب كلامًا
  for(let i = 0; i < voiced.length;){
    if(voiced[i]){ i++; continue; }
    let j = i; while(j < voiced.length && !voiced[j]) j++;
    if(i > 0 && j < voiced.length && j - i < 12) for(let k = i; k < j; k++) voiced[k] = true;
    i = j;
  }
  const frames = []; voiced.forEach((v, i) => { if(v) frames.push(i); });
  if(frames.length < 5) return null;
  const ws = els.map(el => ttsWordWeight(el.textContent));
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return ws.map(w => { const f = frames[Math.min(frames.length - 1, Math.floor((acc / total) * frames.length))]; acc += w; return f / 100; });
}
async function speakSmart(text, onStart, onEnd, verbose, wordEls){
  if(!text) return;
  unlockCloudAudio(); // يجب أن يحدث قبل أي await حتى يبقى ضمن ضغطة المستخدم
  text = await applyDialectForSpeech(text);
  text = omranSpeechNoImg(text); // v-rich-reply: سطر الصور لا يُنطق وعدد كلماته باقٍ
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
  /* v-tts-free: صوت الجهاز (مجّانيّ) للنصّ كلّه، أو لبقيّته من الكلمة fromWord حين يرفض الخادم مقطعًا (انتهى
     الحدّ المجّانيّ أو حصّة اليوم أو تعطّل) — كان المقطع المرفوض يُتخطّى فيصمت ما تبقّى من الردّ. */
  const speakOnDevice = (fromWord, alreadyStarted) => {
    if(!('speechSynthesis' in window)){ if(onEnd) onEnd(); return; }
    const allOffsets = wordStartOffsets(text);
    const base = fromWord > 0 ? allOffsets[fromWord] : 0;
    if(base === undefined){ if(onEnd) onEnd(); return; }
    const sayText = base ? text.slice(base) : text;
    const detectedLang = detectSpeechLang(sayText);
    const langTags = { ar: 'ar-SA', ur: 'ur-PK', hi: 'hi-IN', fr: 'fr-FR', en: 'en-US' };
    const utter = new SpeechSynthesisUtterance(sayText);
    utter.lang = langTags[detectedLang] || 'en-US';
    const v = pickVoice(detectedLang);
    if(v) utter.voice = v;
    utter.rate = ({ slow: 0.9, normal: 1, fast: 1.1, xfast: 1.2 })[ttsSpeedSetting()] || 1; // v-reply-voice-speed + v-maha-pace: صوت الجهاز الاحتياطيّ بالمدى الهادئ نفسه
    const offsets = wordEls && wordEls.length ? allOffsets : null;
    if(offsets){
      utter.onboundary = (e) => {
        if(e.name && e.name !== 'word') return;
        const at = base + e.charIndex;
        let idx = 0;
        for(let i = 0; i < offsets.length; i++){ if(offsets[i] <= at) idx = i; else break; }
        setActiveWord(wordEls, idx);
      };
    }
    utter.onend = () => { clearWordHighlight(); if(onEnd) onEnd(); };
    utter.onerror = () => { clearWordHighlight(); if(onEnd) onEnd(); };
    if(onStart && !alreadyStarted) onStart();
    window.speechSynthesis.speak(utter);
  };
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
        if(i < chunks.length && !promises[i]){
          promises[i] = fetchCloudSpeech(chunks[i].text);
          // guard-ok: الرفض يُعالَج حين يُنتظر المقطع في playChunk (صوت الجهاز) — المقطع المجلوب مسبقًا لا يُبلَّغ «خطأً غير معالج»
          promises[i].catch(() => {});
        }
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
          if('speechSynthesis' in window){
            currentCloudToken = null; currentCloudAudio = null;
            speakOnDevice(chunks[i].wordStart, started);
            return;
          }
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
          /* v-tts-sync (المالك ٢ أكتوبر «الكتابة ما تتبع الصوت، تتأخّر — أريد تطابق الاثنين»): كان التقدير قسمة مدّة المقطع
             على عدد الحروف — يتجاهل صمت البداية والنهاية ووقفات الفواصل والأرقام الطويلة النطق، فينزاح التظليل. وإن بدأ
             الحساب قبل التشغيل (paused) توقّفت الحلقة نهائيًّا. الآن: التقدير القديم فورًا، ثمّ أزمنة من الصوت نفسه
             (ttsVoicedStarts: المقاطع المسموعة فعلًا والوقفات)، والحلقة تبدأ مع «playing». */
          const chunkWordEls = wordEls.slice(chunks[i].wordStart, chunks[i].wordStart + chunks[i].wordCount);
          let starts = null;
          const tick = () => {
            ttsHighlightRaf = null;
            if(currentCloudToken !== token || currentCloudAudio !== audio || audio.ended || audio.src !== url) return; // العنصر نفسه يُعاد لكلّ مقطع
            if(starts && !audio.paused){
              const cur = audio.currentTime + 0.05;
              let idx = 0;
              for(let k = 0; k < starts.length; k++){ if(starts[k] <= cur) idx = k; else break; }
              setActiveWord(wordEls, chunks[i].wordStart + idx);
            }
            if(!audio.paused) ttsHighlightRaf = requestAnimationFrame(tick);
          };
          const arm = () => {
            if(audio.src !== url || currentCloudToken !== token){ audio.removeEventListener('playing', arm); return; }
            if(!ttsHighlightRaf) ttsHighlightRaf = requestAnimationFrame(tick);
          };
          audio.addEventListener('loadedmetadata', () => {
            if(currentCloudToken !== token) return;
            const duration = audio.duration;
            if(!isFinite(duration) || duration <= 0) return;
            if(!starts) starts = ttsWeightStarts(chunkWordEls, 0, duration);
            arm();
          }, { once: true });
          audio.addEventListener('playing', arm);
          ttsVoicedStarts(url, chunkWordEls).then((st) => { if(st && currentCloudToken === token) starts = st; }).catch(() => {}); // guard-ok: يبقى التقدير
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
  speakOnDevice(0, false);
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
  try{ if(window.omranChatFollow) window.omranChatFollow.stickNow(); messagesEl.scrollTop = messagesEl.scrollHeight; syncChatJumpButton(); }catch(e){ window.__swallow && window.__swallow(e,'ui.scrollAnchor'); }
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
    /* v-scroll-free: الملاحقة يقرّرها omranChatFollow (app-40) من حركة المستخدم — لا فرق ١٦٠px يشدّ إصبعه أثناء السحب */
    const __F = window.omranChatFollow;
    const follow = (typeof wasNearBottom === 'boolean') ? wasNearBottom : (__F ? __F.follow() : chatIsNearBottom());
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
    if(window.omranChatFollow) window.omranChatFollow.stickNow();
    messagesEl.scrollTo ? messagesEl.scrollTo({top:messagesEl.scrollHeight, behavior:'smooth'}) : (messagesEl.scrollTop = messagesEl.scrollHeight);
    setTimeout(syncChatJumpButton, 220);
  };
}

// أثناء البث نخفي علامات Markdown الناقصة وننسّق المكتمل فورًا؛ عند اكتمال
// الرابط يعود نصّه نفسه كرابط قابل للنقر بدل القفزة من نص خام إلى تنسيق نهائي.
function streamingMarkdownDisplayText(text){
  return String(text || '')
    // رموز داخلية تُستبدل في العرض النهائي فقط — أثناء البث كانت تظهر خامًا
    // (زحمة تظهر ثم «ترجع عادي» عند الاكتمال). تُخفى من أول قطعة.
    .replace(/!?\[[^\]]*\]\(\s*__IMG_\d+__\s*\)|`?__IMG_\d+__`?/g, '')
    .replace(/__ACTION_VIDEO:[^\n]*/g, '')
    .replace(/\*{0,2}\[([^\]\n]+)\]\((?:https?:\/\/)?[^\s)\n]*$/g, '$1')
    .replace(/\*{0,2}\[([^\]\n]+)\]$/g, omranStreamKeepMathBracket)
    .replace(/\*{0,2}\[([^\]\n]*)$/g, omranStreamKeepMathBracket);
}
// v-chat-math: «[» داخل معادلة مغلقة ($x \in [0, 1)$) ليس رابطًا ناقصًا — لا يُحذف أثناء البثّ
function omranStreamKeepMathBracket(m0, g1, off, all){
  // بالتقاط العرض النهائيّ نفسه على السطر: «[» داخل معادلة ($…$ أو \(…\)، ولو بعد سعر) يبقى
  const ls = all.lastIndexOf('\n', off - 1) + 1;
  let le = all.indexOf('\n', off); if(le < 0) le = all.length;
  const p = off - ls + m0.indexOf('[');
  try{
    if(omranMathMark(all.slice(ls, le)).list.some(function(it){ return p >= it.start && p < it.end; })) return m0;
  }catch(e){ __swallow(e, 'md:math-bracket'); }
  return g1;
}
/* v-stream-incremental (شكوى المالك ١٣ سبتمبر: «الشاشة ثقيلة كثير وتعلق»):
   الرسم الحيّ كان يمسح الفقاعة ويعيد بناء الردّ كلّه كلمةً كلمةً في كلّ نبضة
   (٣٠مل على الكمبيوتر) — ردّ من مئة سطر = آلاف العقد تُبنى ٣٣ مرّة في الثانية
   فيختنق الخيط الرئيسي وتتجمّد الصفحة. الآن يُقسَم النصّ عند آخر فاصل أسطر:
   الجزء المستقرّ يُرسم مرّة واحدة ويُلحَق به ما يستجدّ منه فقط، ولا يُعاد في
   كلّ نبضة إلّا الذيل (السطر أو الفقرة الأخيرة). كتلة كود مفتوحة تبقى كاملةً
   في الذيل كي لا تنقسم. الرسم النهائيّ (renderMessages) لا يتغيّر. */
var OMRAN_STREAM_SPLIT_MIN = 600;
function omranStreamSplitPoint(text){
  if(!text || text.length <= OMRAN_STREAM_SPLIT_MIN) return -1;
  var cut = text.lastIndexOf('\n\n', text.length - 2);
  if(cut < 0) cut = text.lastIndexOf('\n', text.length - 2);
  if(cut <= 0) return -1;
  var fences = (text.slice(0, cut).match(/```/g) || []).length;
  if(fences % 2 === 1) return -1;
  /* v-chat-math: معادلة عرض مفتوحة ($$… أو \[…) لا تنقسم بين الرأس والذيل — نقطع قبل سطر فاتحها */
  var open = omranMathOpenBlock(text.slice(0, cut));
  if(open >= 0){
    cut = text.lastIndexOf('\n', open - 1);
    if(cut <= 0 || ((text.slice(0, cut).match(/```/g) || []).length) % 2 === 1) return -1;
  }
  return cut;
}
// موضع فاتح معادلة عرض ($$ أو \[ أوّل سطره) لم يُغلق بعد، أو -1. يُحسب بالتقاط omranMathMark نفسه على نافذة آخر ٣٠٠٠ حرف
// (معادلة العرض ≤ ١٠٠٠ حرف): فالـ$$ وسط الجملة (PID، فئة أسعار، $$name) لا يُعدّ فاتحًا ولا يقلب الأزواج، والفاتح الأبعد من
// ١٢٠٠ حرف ليس معادلة مفتوحة. نصّ بلا $$ ولا \[ ⇐ -1 فورًا بلا كلفة على الردود العاديّة وردود الكود الطويلة.
function omranMathOpenBlock(h){
  h = String(h);
  if(h.indexOf('$$') < 0 && h.indexOf('\\[') < 0) return -1;
  var ws = h.length > 3000 ? h.lastIndexOf('\n', h.length - 3000) + 1 : 0;
  if(ws > 0 && ((h.slice(0, ws).match(/```/g) || []).length) % 2 === 1) return -1;
  var w = h.slice(ws), items;
  try{ items = omranMathMark(w).list; }catch(e){ __swallow(e, 'md:math-open'); return -1; }
  var blank = w.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g, function(x){ return x.replace(/[^\n]/g, ' '); });
  // فاتح $$ أوّل سطره أو آخره (لا وسط الجملة: PID، فئة أسعار)، و\[ في أيّ موضع («المعادلة هي \[» ثمّ سطورها)
  var re = /\$\$(?!\$)|\\\[/g, m, pos = -1;
  while((m = re.exec(blank))){
    var p = m.index;
    if(m[0] === '$$'){
      if(blank.charAt(p - 1) === '$') continue;
      var ls = blank.lastIndexOf('\n', p - 1) + 1, le = blank.indexOf('\n', p + 2);
      if(le < 0) le = blank.length;
      if(blank.slice(ls, p).trim() && blank.slice(p + 2, le).trim()) continue;
    }
    if(!items.some(function(it){ return p >= it.start && p < it.end; })) pos = p;
  }
  return pos >= 0 && w.length - pos <= 1200 ? ws + pos : -1;
}
function renderStreamingAssistant(el, text){
  if(!el) return;
  el.classList.add('msg-streaming');
  { const __raw = String(text || ''), __rl = __raw.lastIndexOf('\n'); if(omranImgPartial(__raw.slice(__rl + 1))) text = __raw.slice(0, __rl + 1).trimEnd(); } // v-reply-blocks: سطر [[…]] الناقص يُخفى قبل أن يقصّ العرض أوّل «[» منه
  let __st = streamingMarkdownDisplayText(text);
  if(__st && __st.indexOf('[[') >= 0) __st = __st.replace(/\[\[(?:OPT|MULTI)\]\][\s\S]*$/, '').trimEnd();
  if(__st){ const __nl = __st.lastIndexOf('\n'); if(omranImgPartial(__st.slice(__nl + 1))) __st = __st.slice(0, __nl + 1).trimEnd(); } // v-rich-reply
  var cut = omranStreamSplitPoint(__st);
  if(cut < 0){
    el._omStreamHead = null; el._omStreamHeadEl = null; el._omStreamTailEl = null;
    buildSpokenWordSpans(el, __st);
    return;
  }
  var head = __st.slice(0, cut), tail = __st.slice(cut);
  var hw = el._omStreamHeadEl, tw = el._omStreamTailEl;
  var prev = el._omStreamHead;
  var fresh = !hw || !tw || hw.parentNode !== el || tw.parentNode !== el || typeof prev !== 'string';
  if(!fresh && head !== prev){
    if(head.length > prev.length && head.indexOf(prev) === 0){
      /* الرأس امتدّ فقط: نرسم الزيادة في مقطع جديد ونلحقه — لا إعادة لما رُسم. */
      var seg = document.createElement('div');
      seg.className = 'omStreamSeg';
      buildSpokenWordSpans(seg, head.slice(prev.length));
      hw.appendChild(seg);
      el._omStreamHead = head;
    } else {
      fresh = true;
    }
  }
  if(fresh){
    el.innerHTML = '';
    hw = document.createElement('div'); hw.className = 'omStreamHead';
    tw = document.createElement('div'); tw.className = 'omStreamTail';
    var seg0 = document.createElement('div'); seg0.className = 'omStreamSeg';
    buildSpokenWordSpans(seg0, head);
    hw.appendChild(seg0);
    el.appendChild(hw); el.appendChild(tw);
    el._omStreamHeadEl = hw; el._omStreamTailEl = tw; el._omStreamHead = head;
  }
  buildSpokenWordSpans(tw, tail);
}

