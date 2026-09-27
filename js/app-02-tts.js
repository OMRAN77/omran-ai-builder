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
  return /\\[dwsDWSbB](?![A-Za-z])|\[\^/.test(t) || (t.charAt(0) === '|') !== (t.charAt(t.length - 1) === '|')
    || (/[A-Za-z0-9]{2,}_[A-Za-z]{2,}/.test(t) && !/\\[A-Za-z]{2,}/.test(t));
}
function omranMathOkInline(src, m, d, prev, next, cmd){
  const end = m.index + m[0].length;
  const lead = /^[\^_](?:\{[^{}]*\}|\\?[A-Za-z0-9+\-−]+)$/.test(d); // CO$_2$، Na$^+$، $^{14}$C، 25$^\circ$C
  const arVar = /^[\u0621-\u064A]{1,3}$/.test(d);                   // «حيث $ف$ المسافة»
  const oneCmd = /^\\[A-Za-z]+$/.test(d);                          // 3$\times$3، 5$\pm$0.1، $\sim$10
  if(d.length > 300 || (!arVar && !lead && !(omranMathArOk(d) && /[A-Za-z0-9\\\u0621-\u064A]/.test(d)))) return false;
  // قبلها: لا رقم/حرف/\/$ (10$، USD$5) — إلّا الأسّ الملتصق والأمر المفرد
  if(!lead && !oneCmd && /[0-9A-Za-z\\$]/.test(prev)) return false;
  // بعدها: لا رقم/حرف/$/(/{/_ ($5-$10، $HOME$PATH، ${a}${b}، $(pwd)) — إلّا الأسّ والأمر المفرد، وحرفًا أو قوسًا بعد معادلة
  // فيها أمر أو أسّ ($25^\circ$C، $H_2O$(l)، $x_i$s)، ولاحقة ترتيبيّة ($(k+1)$th)، وحرفًا بعد متغيّر مفرد ($n$th)
  if(!lead && !oneCmd && /[0-9A-Za-z$({_\\]/.test(next)){
    const okNext = (/[\\^_]/.test(d) && /[A-Za-z(]/.test(next)) || /^(?:th|st|nd|rd)\b/.test(src.slice(end, end + 3))
      || (/^[A-Za-z]$/.test(d) && /[A-Za-z]/.test(next));
    if(!okNext) return false;
  }
  if(/^[\/"']|[\/"]$|[^A-Za-z0-9')]'$/.test(d)) return false; // اقتباس أو مسار — f' وf'' مقبولتان
  if(!lead && /[-+*\/=^_,.:;]$/.test(d)) return false;          // «$5-$» أثناء البثّ، و«=$A2^$B2» (لا شحنة Na$^+$)
  // رمز عملة بعد رقم: «$5 (A$ 7)»، «$5 vs A$ 8»، «from $2 to R$ 10»
  if(/^\d/.test(d) && /[A-Z]$/.test(d) && (/[\s(][A-Z]{1,3}$/.test(d) || /^ \d/.test(src.slice(end, end + 2)))) return false;
  if(cmd || /[\^_]/.test(d) || arVar) return true;
  // بلا أمر ولا أسّ: أقواس متوازنة، ولا كلام (كلمتان متتاليتان، أو رقم يليه كلام، أو كلمة من ٤ أحرف إلّا صيغة
  // كيميائيّة أو اسم شكل بلا مسافات ($NaOH$، $ABCD$) أو دالّة معروفة أو طرف علاقة ($Area = lw$))
  if((d.match(/[(\[]/g) || []).length !== (d.match(/[)\]]/g) || []).length) return false;
  if(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(d) || (/^\d/.test(d) && /(?:^|[^A-Za-z])[A-Za-z]{2,}(?![A-Za-z])/.test(d))) return false;
  const noFn = d.replace(/(?:arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|log|exp|lim|max|min|det|gcd)(?![A-Za-z])/g, ' ');
  return !/[A-Za-z]{4,}/.test(noFn) || /^[A-Za-z0-9]{2,10}$/.test(d) || /[=<>]/.test(d);
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
    if(block) return /[A-Za-z0-9\\]/.test(a) && (/\\begin|&|\\\\/.test(a) || !/\n\s*(?:[-*+•]|\d+[.)])\s/.test(a));
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
    .replace(/\\begin\s*\{([pbvBV]?)matrix\*?\}([\s\S]*?)\\end\s*\{[pbvBV]?matrix\*?\}/g, function(m0, k, body){
      const L = { p: '(', b: '[', v: '|', V: '‖', B: '\uE011' }[k] || '', R = { p: ')', b: ']', v: '|', V: '‖', B: '\uE012' }[k] || '';
      return L + omranMathRows(body, ' ').join('; ') + R;
    })
    .replace(/\\begin\s*\{cases\*?\}([\s\S]*?)\\end\s*\{cases\*?\}/g, function(m0, body){
      return '\uE011 ' + omranMathRows(body, ', ').join(block ? '\n\u2060\u00A0\u00A0\u00A0' : '; ');
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
    .replace(/\^\s*([^\s{}\\\u0001-\u0006])/g, function(m0, ch){ return omranMathScript(ch, true); })
    .replace(/_\s*([^\s{}\\\u0001-\u0006])/g, function(m0, ch){ return omranMathScript(ch, false); })
    .replace(/[{}]/g, '').replace(/&/g, ' ').replace(/~/g, ' ')
    .replace(/\uE011/g, '{').replace(/\uE012/g, '}').replace(/\uE013/g, '_').replace(/\uE014/g, '&')
    .replace(/[ \t]+/g, ' ');
  return s.split('\n').map(function(l){ return l.trim(); }).filter(Boolean).join('\n');
}
// للمشاركة والنسخ (innerText): e^(-x) لا «e-x» — علامة ^( ) أو _( ) مخفيّة بصريًّا حول الأسّ والدليل المرسومين بعنصر
function omranMathSr(x){
  const t = x.textContent, many = t.length > 1;
  const a = document.createElement('span');
  a.className = 'om-math-sr';
  a.textContent = (/^sup$/i.test(x.tagName) ? '^' : /^sub$/i.test(x.tagName) ? '_' : '→') + (many ? '(' : '');
  x.insertBefore(a, x.childNodes[0] || null);
  if(many){ const b = document.createElement('span'); b.className = 'om-math-sr'; b.textContent = ')'; x.appendChild(b); }
}
function omranMathEl(item){
  let txt = omranMathText(item.src, item.block);
  if(!txt.replace(/[\u0001-\u0006]/g, '').trim()) return document.createTextNode(item.raw);
  // لا حروف لاتينيّة خارج \text{} ⇐ معادلة عربيّة (ع = ف/ز، 2س + 3 = 11): rtl وتنعكس الأسهم كي تشير إلى النواتج.
  // وإلّا لاتينيّة ولو بتسميات عربيّة (6CO₂ →^{ضوء الشمس} …): ltr كي لا ينقلب التفاعل
  const rtl = OMRAN_MATH_AR.test(txt) && !/[A-Za-z]/.test(omranMathPlain(item.src));
  if(rtl) txt = txt.replace(/[→←⟶⟵⇒⇐⟹⟸⇌⇋↦↤]/g, function(ch){ return OMRAN_MATH_MIRROR[ch]; });
  // الالتفاف: القصيرة في السطر لا تنكسر أبدًا (om-math-nw: «kJ ·» ثمّ «mol⁻¹»، «AB» ثمّ «= b - a»)، والكسر لا ينكسر عند شرطته، والطويلة تنكسر
  // بعد المعاملات وبين المجموعات الكيميائيّة (…)₆|(OH) لا بين حرف وأسّه
  const nw = !item.block && txt.length <= 32;
  txt = txt.replace(/\//g, '\u2060/\u2060');
  if(txt.length > 32) txt = txt.replace(/([+=×·<>≤≥→⇌−])(?=[^\s\u00A0\u0002\u0004\u0006])/g, '$1\u200B')
    .replace(/([\u2080-\u2089\u00B2\u00B3\u00B9\u2070-\u2079)])(?=[A-Z(])/g, '$1\u200B');
  const el = document.createElement('span');
  el.className = 'om-math' + (item.block ? ' om-math-block' : '') + (nw ? ' om-math-nw' : '');
  el.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  el.style.unicodeBidi = 'isolate';
  const stack = [el];
  txt.split(/([\u0001-\u0006])/).forEach(function(p){
    if(!p) return;
    const top = stack[stack.length - 1];
    if(p === '\u0001' || p === '\u0003' || p === '\u0005'){
      const x = document.createElement(p === '\u0001' ? 'sup' : p === '\u0003' ? 'sub' : 'span');
      if(p === '\u0005') x.className = 'om-vec';
      top.appendChild(x); stack.push(x);
    }
    else if(p === '\u0002' || p === '\u0004' || p === '\u0006'){ if(stack.length > 1) omranMathSr(stack.pop()); }
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
  if(first){
    const t = first.textContent;
    let i = 0;
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
function buildSpokenWordSpans(container, text){
  text = mdTablesToLines(text); // v-md-table
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
      parent.appendChild(document.createTextNode(between));
      if(between.indexOf('\n') !== -1){ headerLevel = 0; lineStart = true; }
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
      if(linkM || urlM || bareM){
        if(__lead) __appendMath(span, __lead);
        const rawUrl = linkM ? linkM[2] : (urlM ? urlM[1] : bareM[1] + bareM[2]);
        const href = (rawUrl.indexOf('www.') === 0 || bareM) ? 'https://' + rawUrl : rawUrl;
        const a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        // v-clean-links: الرابط العاري كان يُعرض بنصّه الكامل المرمّز
        // (%D8%A3…) فيملأ الشاشة — يُعرض باسم نطاقه فقط ويبقى الضغط
        // على الرابط الكامل. ونصّ ماركداون هو نفسه رابط يُعامل كذلك.
        let __disp = linkM ? linkM[1] : rawUrl;
        if(bareM){ __disp = bareM[1].replace(/^www\./, ''); } // اسم النطاق فقط
        else if(/^(https?:\/\/|www\.)/i.test(__disp)){
          try { __disp = new URL(__disp.indexOf('www.') === 0 ? 'https://' + __disp : __disp).hostname.replace(/^www\./, ''); }
          catch(e){ try { __disp = decodeURIComponent(__disp).slice(0, 50); } catch(e2){ __disp = __disp.slice(0, 50); } }
        }
        a.textContent = __disp;
        a.title = href;
        a.setAttribute('dir', 'auto'); // v476 bidi
        a.style.cssText = 'color:var(--om-hl,#e3b341); text-decoration:underline; word-break:break-all; unicode-bidi:isolate;'; /* v-hl-yellow: الروابط صفراء (طلب المالك) */
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
    if(n.nodeType === 1 && n.className === 'chat-codeblock'){ out.push(n); newLine(); return; }
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
  const ls = all.lastIndexOf('\n', off - 1) + 1;
  const before = all.slice(ls, off).replace(/\$\$/g, '');
  return (before.match(/\$/g) || []).length % 2 === 1 && all.indexOf('$', off) > off ? m0 : g1;
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
  let __st = streamingMarkdownDisplayText(text);
  if(__st && __st.indexOf('[[') >= 0) __st = __st.replace(/\[\[(?:OPT|MULTI)\]\][\s\S]*$/, '').trimEnd();
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

