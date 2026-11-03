'use strict';
/* v-owner-inbox (أمر المالك ٢٠ أكتوبر: «اريد كلام المستخدمين يكون الخطاء يحول عندي ولا فيه شتيمه ولا متضايق من التطبيق كيف اعرف» ← «نعم ابدا»):
   صندوق المالك. حارس على كلام غير المالك في المحادثة والوكيل — بقائمة كلمات بلا موديل ولا كلفة: شتيمة (insult)، أو تذمّر من
   التطبيق (complaint: عبارة قويّة وحدها، أو عبارة ضعيفة مع ذكر التطبيق/المساعد/«انت»)، أو فشل ردّ أمامه (error: حدث error من الخادم).
   يُحفظ البلاغ وحده — الاسم والوقت والمزوّد والنوع ومقطع ≤٢٠٠ حرف — لا المحادثة (المالك وافق صراحةً على قراءة المقاطع). يصل المالك
   Push فورًا (مرّة لكلّ مستخدم ونوع في الساعة)، ويظهر في لوحته («📥 صندوق المالك» في نافذة رأيك يهمنا)، وإيميل يوميّ مجمّع مع
   جرد البريد (email-sweep). المالك نفسه لا يُبلَّغ عن كلامه. لا مفتاح يُقرأ في نطاق الوحدة. */
const LIST_KEY = 'db/owner-inbox/list.json';
const DIGEST_KEY = 'db/owner-inbox/digest.json';
const PUSH_KEY = 'db/owner-inbox/push/';
const MAX_ITEMS = 300;
const EXCERPT = 200;
const SCAN_MAX = 4000;
const PUSH_TTL_S = 3600;
const DEDUPE_MS = 10 * 60 * 1000;

// حدود الكلمة بلا \b (ميّت جنب العربيّة): بداية أو فاصل قبلها، ونهاية أو فاصل بعدها.
const B = '(?:^|[\\s،,.!؟?«»"\'()\\-:؛;])', E = '(?=$|[\\s،,.!؟?«»"\'()\\-:؛;])';
const AR = (words) => new RegExp(B + '(?:' + words + ')' + E, 'i');
const EN = (words) => new RegExp('(?:^|[^a-z])(?:' + words + ')(?=$|[^a-z])', 'i');
// شتيمة: اسم يُقال لشخص مع «يا» أو «انت» (كلمة «كلب» وحدها في «قصّة عن كلب» ليست شتيمة)، أو بذاءة لا تحتمل معنى آخر
const AR_NOUNS = 'كلب|كلاب|حمار|حمير|حيوان|حيوانات|بغل|تيس|غبي|غبيّ|غبية|غبيه|أغبى|اغبى|تافه|تافهة|تافهه|كذاب|كذّاب|نصاب|نصّاب|حرامي|حراميه|قذر|حقير|وسخ|زبالة|زباله|معفن|معفّن|متخلف|متخلّف|معاق|خسيس|مقرف|فاشل|فاشلة|فاشله|زفت|خايس|خايسة|خايسه|سخيف|سخيفة|مجنون|مجنونة|أهبل|اهبل|هبلة|غشاش|غشّاش';
const VOC = '(?:يا|ياك|يالـ|انت|أنت|انتي|أنتي|انته|أنته|انتم|أنتم|انتوا|أنتوا|كلكم|كلّكم)';
const INSULT_AR = new RegExp(B + VOC + '\\s*(?:' + AR_NOUNS + ')' + E + '|' + B + '(?:' + AR_NOUNS + ')\\s+(?:انت|أنت|انتي|أنتي|انتم|أنتم|انتوا|أنتوا|يا)' + E + '|' + B + '(?:ياكلب|ياحمار|ياغبي|ياحيوان|ياتافه|ياخايس|يازفت|يامتخلف|يامعاق|يافاشل)' + E, 'i');
const OBSCENE_AR = AR('خرا|خراء|خره|تفو|تفوو|يلعن|يلعنك|يلعنكم|لعنة الله|ملعون|ملعونين|زق|كسم|كسمك|كسمكم|كس امك|كس أمك|كس اختك|عرص|عرصة|خول|قواد|قوّاد|شرموط|شرموطة|منيوك|احا|أحا|طز|طظ|انقلع|انقلعوا|اخرس|اخرسي|ولد الكلب|ابن الكلب|اولاد الكلب|أولاد الكلب|يخسي|يخسون|انجب|انجبوا|كول خرا|كل خرا|تبًّا لك|تبا لك|تبّا لكم|تبا لكم');
const EN_NOUNS = 'stupid|idiot|idiots|idiotic|dumb|dumbass|moron|morons|retard|retarded|pathetic|loser|losers|clown|clowns|trash|garbage|brainless|worthless';
const INSULT_EN = new RegExp('(?:^|[^a-z])(?:you|u|ya|this (?:app|bot|thing|ai)|the (?:app|bot|ai))(?:\\s+(?:are|is|re|were|\'re|\'s))?(?:\\s+(?:so|such|a|an|all|really|very|just|fucking|damn))*\\s+(?:' + EN_NOUNS + ')(?=$|[^a-z])|(?:^|[^a-z])(?:' + EN_NOUNS + ')\\s+(?:app|bot|ai|assistant|thing|program)(?=$|[^a-z])', 'i');
const OBSCENE_EN = EN('fuck|fucking|fucked|fck|shit|shitty|bullshit|asshole|bitch|bastard|stfu|wtf|motherfucker|dick|cunt|dickhead');
// تذمّر قويّ: عن التفاعل نفسه أو عن الحساب — يكفي وحده
const STRONG_AR = AR('ضيعت وقتي|ضيّعت وقتي|ضيعتوا وقتي|وقتي ضاع|راح وقتي|زهقت|مللت|تعبت منه|تعبت منك|تعبت منكم|محبط|محبطة|خيبة|خيّبني|خيبني|مو راضي|غير راضي|مب راضي|متضايق|متضايقة|متضايقه|زعلان|زعلانة|زعلانه|معصب|معصّب|معصبة|معصبه|متنرفز|متنرفزة|مستاء|مستاءة|غاضب|غاضبة|ارجع فلوسي|أرجع فلوسي|رجعوا فلوسي|ارجعوا فلوسي|ابي فلوسي|أبي فلوسي|استرجاع|استرداد|الغي اشتراكي|ألغي اشتراكي|الغوا اشتراكي|بطل اشتراكي|بطلوا اشتراكي|نفس الخطأ|نفس الخطا|نفس المشكلة|نفس المشكله|نفس الغلط|للمرة الثانية|للمرة الثالثة|مرة ثالثة|مره ثالثه|كل مرة نفس|كل مره نفس|ما ينفع هذا التطبيق|شو هذا التطبيق|وش هذا التطبيق|شو هالتطبيق|وش هالتطبيق');
const STRONG_EN = EN('waste of time|wasting my time|cancel my subscription|refund me|my money back|same error|same problem|same issue|keeps failing|again and again|fed up|frustrated|disappointed|wtf|this app is|this bot is');
// تذمّر ضعيف: يصير بلاغًا مع ذكر التطبيق أو المساعد أو «انت»
const WEAK_AR = AR('ما يشتغل|مايشتغل|ما تشتغل|ما يفتح|مايفتح|ما يرد|ما يردّ|مايرد|ما ترد|ما يجيب|ما يستجيب|ما يفهم|مايفهم|ما تفهم|ماتفهم|ما فهمت علي|ما يحفظ|ما حفظ|ضاعت|اختفت|ما ينفع|ماينفع|مش شغال|مو شغال|غير شغال|مب شغال|معلّق|معلق|يعلق|يهنق|يهنّق|هنق|خربان|خرب|عطلان|معطل|معطّل|فيه عطل|فيه مشكلة|فيه مشكله|فيه خلل|بطيء|بطئ|بطييء|فاشل|فاشلة|فاشله|سيء|سيّء|سيئ|ما يسوى|مايسوى|ما يستاهل|ما تعرف شي|ما يعرف شي|ما تعرف|ما يعرف|غلط|خطأ|اخطاء|أخطاء|ما يطلع|مايطلع|ما ينزل|ماينزل|ما يرسل|مايرسل|ما يحمل|مايحمل|ما يصير|مايصير|ما قدر|ما قدرت|زبالة|زباله|مقرف|خايس|خايسة|زفت|تافه|قذر|وسخ|غبي|غبية|سخيف|نصب|احتيال|غشّ|غش');
const WEAK_EN = EN('not working|doesn\'t work|does not work|didn\'t work|broken|useless|slow|terrible|horrible|worst|bug|buggy|crash|crashed|crashes|annoying|bad|awful|refund|error|errors|failed|fails|stuck|hangs|freezes|scam|scammer|scammers|rip-off|ripoff|fraud');
const SUBJECT = new RegExp(B + '(?:التطبيق|البرنامج|الموقع|الذكاء|البوت|الروبوت|النظام|المساعد|عمران|مها|الموديل|النموذج|الاداة|الأداة|الخدمة|الخدمه|انت|أنت|انتي|أنتي|انته|أنته|انتم|أنتم|انتوا|أنتوا|هالتطبيق|هالبرنامج|هالموقع|هالشي|هذا الشي)' + E + '|(?:^|[^a-z])(?:app|application|bot|chatbot|website|site|assistant|you|your|this thing)(?=$|[^a-z])', 'i');

function excerpt(t, n) {
  const s = String(t || '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = s.length > (n || EXCERPT) ? s.slice(0, n || EXCERPT) : s;
  return (typeof cut.toWellFormed === 'function' ? cut.toWellFormed() : cut) + (s.length > cut.length ? '…' : '');
}
/* v-inbox-near (بلاغ «grace» ٣٠ أكتوبر: «i want you to build for me the Dandora community filled with litters broken drainge systems…»
   صار «متضايق من التطبيق» — «broken» وصفٌ للمجاري و«you» في أوّل الطلب). ثلاث مراجعات لـPR #1265 أسقطت كلّ استثناء أوسع (أسكت
   شكاوى حقيقيّة تصل على main: «سوّ لي صورة ثانية الأولى زبالة»، «can you make it again the last one was terrible»، «الزر خربان»).
   الاستثناء الآن نحويّ ضيّق — الصفة **نعتٌ** في وصف المطلوب لا **خبرٌ** عن شيء:
   ١) صفة ثابتة (broken/bad/terrible… خربان/زفت/خايس…) لا سلوك التطبيق (slow/stuck/بطيء/معلق) ولا فشل (failed/error/ما يرد) — هذه لا تُستثنى؛
   ٢) نعت: قبلها اسم نكرة لا معرفة ولا رابط (is/was/so/its… طلعت/كان/مرة)، وبعدها كلمة في عبارتها («a broken robot»، «سيارة خربانة») —
      «الزر خربان» و«this one is bad» خبر = شكوى؛
   ٣) بعد طلب صنع صريح حاضر (لي/لنا، please/can you/want you to، أو فعل أوّل العبارة بعده مفعول) — لا «قلت لك ارسم لي»، ولا «asked you to»؛
   ٤) لا بينهما علامة قطع ولا but/because/still/بس/للحين/طلعت، ولا رجوع لنتيجة سابقة (again/last/better/ثانية/الأولى/اللي قبل/عطيتني)،
      ولا ذكر التطبيق/المساعد/«انت»؛ ولا ذكرٌ له بعد الصفة مباشرةً («خايس هالتطبيق»).
   وما عداه كما على main: كلمة ضعيفة + ذكر التطبيق في أيّ مكان. فهرسة النصّ مرّة واحدة بخطوات خطّيّة (≤١٠م.ث لـ٤٠٠٠ حرف). */
const CREATE = new RegExp(B + '(?:ارسم|ارسملي|صمم|صمّم|صمملي|سوّ|سوي|سوّي|سويلي|سوّلي|اعمل|اكتب|اكتبلي|ابني|ابنيلي|ولّد|ولد|انشئ|أنشئ|اصنع|اصنعلي|تخيل|تخيّل)' + E
  + '|(?:^|[^a-z])(?:build|make|create|draw|generate|design|write|paint|render|imagine|illustrate|animate|compose)(?=$|[^a-z])', 'i');
const set = (str) => new Set(str.split(' '));
const CREATE_ATTACHED = set('ارسملي صمملي سويلي سوّلي اكتبلي ابنيلي اصنعلي');
const FOR_ME_AR = set('لي لنا');
const ASK_EN = set("please pls plz kindly lets let's wanna");
const ASK_YOU_EN = set('can could would will please pls plz');
const WANT_EN = set("want need i'd like love");
const OBJECT_EN = set('me us a an the my our some this that him her them one another');
const PAST_AR = set('قلت قلتلك قلنا اقول أقول اقولك أقولك اقوله طلبت طلبنا لما اذا إذا امس أمس كل ما لين'); // «قلت لك ارسم لي…» طلب مضى
/* صفات ثابتة تصف المطلوب — وحدها تُستثنى (لا سلوك التطبيق: slow/stuck/annoying/buggy/بطيء/معلق) */
const DESCRIBE = /^(?:broken|terrible|horrible|worst|bad|awful|useless|خربان|خربانة|خربانه|عطلان|معطل|معطّل|سيء|سيّء|سيئ|زبالة|زباله|مقرف|خايس|خايسة|خايسه|زفت|تافه|قذر|وسخ|غبي|غبية|سخيف|فاشل|فاشلة|فاشله)$/i;
const BREAK_WORDS = set('but however yet still although though tho bt because cuz coz cause bc since now بس لكن للحين لسه لسا مازال بعده رغم بالرغم ترى ترا ليش صار طلع طلعت يطلع تطلع كان كانت');
const BACKREF = set('again last previous old first better another redo properly proper same version once time ثاني ثانية ثانيه مرة مره جديد قبل الاول الأول الاولى الأولى السابق السابقة عطيتني سويته سويتها سويتوه عدل احسن أحسن افضل أفضل نفس');
const PRED_EN = set("is was are were be been being am 's look looks looked looking sound sounds sounded seem seems seemed feel feels felt get gets got getting become became becomes came comes out its it's it this that these those so too very really kinda pretty quite super extremely not isn't isnt wasn't wasnt aren't arent doesn't doesnt don't dont never less more still always ur you're youre u you totally completely just damn fucking same all everything kept keeps stays remains");
const PRED_AR = set('هو هي هم هذا هذي هذه هذيك ذا كان كانت صار صارت طلع طلعت يطلع تطلع مرة مره وايد جدا كله كلها مو مب مش ما يبين تبين شكله شكلها الحين للحين قبل عطيتني سويته');
const AFTER_EN = set('for in on at to with by from of and or again today now lol as like af asf though tho bro man honestly anymore ever');
const AFTER_AR = set('مرة مره وايد جدا كذا اليوم الحين للحين حيل مرررة');
const CLAUSE_CH = '.!?؟…\n،,;؛:—–';
const CORE = /[\p{L}\p{N}'](?:.*[\p{L}\p{N}'])?/su; // لبّ الكلمة بلا علامات حولها — خطّيّ (التقليم بنمط نهايته غير مثبّتة تربيعيّ)
/* تطبيع للبحث في القوائم: بلا تشكيل ولا تطويل، وبلا و/ف/ب في أوّل كلمة عربيّة («وطلعت»، «وللحين»، «والتطبيق») */
const bare = (w) => w.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
const inSet = (S, w) => { const b = bare(w); return S.has(b) || (/^[وفب][\u0600-\u06FF]{2,}$/.test(b) && S.has(b.slice(1))); };
const definite = (w) => /^(?:[وفبل]?ال|لل)[\u0600-\u06FF]/.test(bare(w));
function allIdx(re, s) {
  const g = new RegExp(re.source, 'gi'), out = [];
  for (let m = g.exec(s); m; m = g.exec(s)) {
    const lead = m[0].search(/[\p{L}\p{N}]/u);
    out.push({ p: m.index + (lead < 0 ? 0 : lead), e: m.index + m[0].length, t: m[0].slice(lead < 0 ? 0 : lead) });
    if (g.lastIndex === m.index) g.lastIndex++;
  }
  return out;
}
/** فهرس النصّ مرّة واحدة: الكلمات (موضع أوّل حرف + الكلمة مطبَّعة) ورقم عبارة كلّ كلمة (علامة قطع أو كلمة قطع تبدأ عبارة). */
function textIndex(s) {
  const n = s.length, mark = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) mark[i + 1] = mark[i] + (CLAUSE_CH.includes(s[i]) ? 1 : 0);
  const pos = [], norm = [], cl = [];
  let extra = 0;
  for (const m of s.matchAll(/\S+/g)) {
    const c = CORE.exec(m[0]);
    if (!c) continue;
    const w = c[0].toLowerCase();
    if (inSet(BREAK_WORDS, w) || /^[وف]?[تيا]?طلع/.test(bare(w))) extra++; // «طلعت/تطلعها/يطلع لي…» حكمٌ على الناتج
    pos.push(m.index + c.index); norm.push(w); cl.push(mark[m.index + c.index] + extra);
  }
  /* رقم الكلمة عند موضع: آخر كلمة تبدأ عنده أو قبله */
  const word = (p) => { let lo = 0, hi = pos.length - 1, k = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (pos[mid] <= p) { k = mid; lo = mid + 1; } else hi = mid - 1; } return k; };
  return { pos, norm, cl, word };
}
/** فعل الصنع طلبٌ صريح حاضر (لا «كل ما اكتب له»، ولا «Build failed»، ولا «قلت لك ارسم لي»، ولا «I asked you to make»)؟ */
function isRequest(m, T) {
  const k = T.word(m.p); if (k < 0) return false;
  const v = T.norm[k], at = (j) => (j >= 0 && j < T.norm.length && T.cl[j] === T.cl[k] ? T.norm[j] : '');
  if (/[\u0600-\u06FF]/.test(v)) {
    if (!(CREATE_ATTACHED.has(v) || FOR_ME_AR.has(at(k + 1)))) return false;
    for (let j = k - 1; j >= k - 4; j--) if (at(j) && inSet(PAST_AR, at(j))) return false;
    return true;
  }
  const prev = at(k - 1), prev2 = at(k - 2), prev3 = at(k - 3);
  if (ASK_EN.has(prev)) return true;
  if ((prev === 'you' || prev === 'u') && ASK_YOU_EN.has(prev2)) return true;
  if (prev === 'to' && (prev2 === 'you' || prev2 === 'u')) return WANT_EN.has(prev3) || ASK_YOU_EN.has(prev3); // «want you to» لا «asked/told you to»
  if (prev === 'to' && WANT_EN.has(prev2)) return prev3 === 'i' || prev3 === 'we' || !prev3;
  return !prev && OBJECT_EN.has(at(k + 1));
}
const lastBefore = (arr, p) => { let lo = 0, hi = arr.length - 1, k = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid].p < p) { k = mid; lo = mid + 1; } else hi = mid - 1; } return k; };
/** الصفة نعتٌ في وصف ما طُلب للتوّ (فلا تُعدّ تذمّرًا)؟ */
function describesRequest(w, req, subj, subjWords, T) {
  if (!DESCRIBE.test(w.t.trim())) return false;
  const k = T.word(w.p), r = lastBefore(req, w.p);
  if (k < 1 || r < 0) return false;
  const rk = T.word(req[r].p);
  if (T.cl[rk] !== T.cl[k]) return false;
  const prev = T.norm[k - 1], next = k + 1 < T.norm.length && T.cl[k + 1] === T.cl[k] ? T.norm[k + 1] : '';
  const ar = /[\u0600-\u06FF]/.test(T.norm[k]);
  if (!next || (ar ? (inSet(PRED_AR, prev) || definite(prev) || inSet(AFTER_AR, next)) : (PRED_EN.has(prev) || AFTER_EN.has(next)))) return false;
  for (let j = rk + 1; j < k; j++) if (inSet(BACKREF, T.norm[j])) return false;
  const sNext = subj[lastBefore(subj, req[r].p + 1) + 1];
  if (sNext && sNext.p < w.p) return false; // ذكر التطبيق بين الطلب والصفة
  const sAfter = subjWords.find((x) => x > k); // ذكره بعدها مباشرةً: «خايس هالتطبيق»، «broken in your app»
  return !(sAfter !== undefined && sAfter - k - 1 <= 2 && T.cl[sAfter] === T.cl[k]);
}
function weakComplaint(s) {
  const weak = allIdx(WEAK_AR, s).concat(allIdx(WEAK_EN, s));
  if (!weak.length) return false;
  const subj = allIdx(SUBJECT, s);
  if (!subj.length) return false;
  const T = textIndex(s);
  const req = allIdx(CREATE, s).filter((m) => isRequest(m, T));
  if (!req.length) return true; // بلا طلب صنع: كما على main
  const subjWords = subj.map((x) => T.word(x.p));
  /* كلمة ضعيفة واحدة ليست نعتًا لما يُطلب تكفي (كما على main) */
  return weak.some((w) => !describesRequest(w, req, subj, subjWords, T));
}
/** نوع البلاغ لكلام المستخدم: 'insult' · 'complaint' · null. الشتيمة أوّلًا. */
function classify(text) {
  const s = String(text || '').slice(0, SCAN_MAX);
  if (!s.trim()) return null;
  if (INSULT_AR.test(s) || OBSCENE_AR.test(s) || INSULT_EN.test(s) || OBSCENE_EN.test(s)) return 'insult';
  if (STRONG_AR.test(s) || STRONG_EN.test(s)) return 'complaint';
  if (weakComplaint(s)) return 'complaint';
  return null;
}
function isOwnerUser(user) { try { return require('./_owner.js').isOwnerName(user); } catch (e) { return false; } }
const normKey = (t) => String(t || '').toLowerCase().replace(/[\s*#`>_~|•\-،,.!؟?]+/g, ' ').trim().slice(0, 120);

async function readList(kv) {
  try { const d = await kv.kvGetJSON(LIST_KEY); return Array.isArray(d && d.items) ? d.items : []; } catch (e) { return []; }
}
/** يحفظ بلاغًا (بلا تكرار لنفس المستخدم والنوع والنصّ خلال ١٠ دقائق) ويدفع للمالك مرّة في الساعة لكلّ مستخدم ونوع. */
async function record(entry, opts) {
  const o = opts || {};
  const kv = o.kv || require('./kv.js');
  const now = typeof o.now === 'number' ? o.now : Date.now();
  const user = String(entry.user || 'guest').slice(0, 40);
  const item = { id: 'R' + now.toString(36) + Math.random().toString(36).slice(2, 5), at: now, user, prov: String(entry.prov || '').slice(0, 20), via: entry.via === 'agent' ? 'agent' : 'chat', kind: entry.kind, text: excerpt(entry.text) };
  if (entry.detail) item.detail = excerpt(entry.detail, 140);
  const items = await readList(kv);
  const key = normKey(item.text);
  if (items.some((x) => x && x.user === user && x.kind === item.kind && now - (Number(x.at) || 0) < DEDUPE_MS && normKey(x.text) === key)) return { saved: false, reason: 'dup', item: null };
  items.push(item);
  await kv.kvPutJSON(LIST_KEY, { items: items.slice(-MAX_ITEMS) });
  let pushed = false;
  try {
    const fresh = await kv.kvSetIfAbsent(PUSH_KEY + encodeURIComponent(user.toLowerCase()) + ':' + item.kind, String(now), PUSH_TTL_S);
    if (fresh) {
      const push = o.push || require('./_owner-alert.js').pushToOwners;
      const title = item.kind === 'insult' ? '🤬 شتيمة من مستخدم' : (item.kind === 'complaint' ? '😠 مستخدم متضايق من التطبيق' : '⚠️ فشل ردّ أمام مستخدم');
      await push({ title, body: user + ' · ' + (item.prov || '-') + ': ' + item.text.slice(0, 120) + (item.detail ? ' — ' + item.detail.slice(0, 60) : ''), url: '/' }, o.pushOpts);
      pushed = true;
    }
  } catch (e) { try { require('./log-error.js').logError('owner-inbox:push', e); } catch (e2) { /* guard-ok — فشل الإشعار لا يمنع الحفظ */ } }
  return { saved: true, pushed, item };
}
/** كلام المستخدم في بداية الدور: المالك لا يُبلَّغ عن نفسه. */
async function scanTurn(args, opts) {
  const a = args || {};
  if (!a.user || isOwnerUser(a.user)) return { kind: null };
  const kind = classify(a.text);
  if (!kind) return { kind: null };
  const r = await record({ user: a.user, prov: a.prov, via: a.via, kind, text: a.text }, opts);
  return Object.assign({ kind }, r);
}
/** حدث error وصل مستخدمًا (لا المالك): بلاغ نوعه error بمقطع رسالته ونصّ الخطأ. */
async function noteFailure(args, opts) {
  const a = args || {};
  if (!a.user || isOwnerUser(a.user)) return { kind: null };
  const err = typeof a.error === 'string' ? a.error : JSON.stringify(a.error || '');
  const r = await record({ user: a.user, prov: a.prov, via: a.via, kind: 'error', text: a.text || '(بلا نصّ)', detail: err }, opts);
  return Object.assign({ kind: 'error' }, r);
}
const KIND_LABEL = { insult: 'شتيمة', complaint: 'متضايق من التطبيق', error: 'فشل ردّ أمامه' };
function uaeTime(ms) { try { return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', hour12: false }); } catch (e) { return new Date(ms).toISOString(); } }
/** الإيميل اليوميّ: ما جدّ منذ آخر إرسال، وإلّا لا شيء. يُنادى من email-sweep (مرّة كلّ ٢٠ ساعة). */
async function dailyDigest(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const kv = o.kv || require('./kv.js');
  const now = typeof o.now === 'number' ? o.now : Date.now();
  const to = String(env.OWNER_NOTIFY_EMAIL || '').trim();
  if (!to || !env.RESEND_API_KEY) return { sent: false, reason: 'off' };
  let since = 0;
  try { const d = await kv.kvGetJSON(DIGEST_KEY); since = Number(d && d.sentAt) || 0; } catch (e) { since = 0; }
  const items = (await readList(kv)).filter((x) => x && Number(x.at) > since && Number(x.at) <= now);
  if (!items.length) return { sent: false, reason: 'empty' };
  const auth = require('./auth.js');
  const esc = (s) => auth.escapeHtml(String(s == null ? '' : s));
  const counts = items.reduce((m, x) => { m[x.kind] = (m[x.kind] || 0) + 1; return m; }, {});
  const html = '<div dir="rtl" style="font-family:sans-serif;max-width:640px;margin:0 auto">'
    + '<h2 style="margin:0 0 8px">صندوق المالك — ' + items.length + ' بلاغًا جديدًا</h2>'
    + '<p style="margin:0 0 12px;color:#666">' + Object.keys(counts).map((k) => esc(KIND_LABEL[k] || k) + ': ' + counts[k]).join(' · ') + '</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:14px">'
    + items.slice().reverse().map((x) => '<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap;color:#666">' + esc(uaeTime(x.at)) + '</td>'
      + '<td style="padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap"><b>' + esc(x.user) + '</b><br><span style="color:#888">' + esc(x.prov || '') + '</span></td>'
      + '<td style="padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap">' + esc(KIND_LABEL[x.kind] || x.kind) + '</td>'
      + '<td style="padding:6px 8px;border-bottom:1px solid #ddd">' + esc(x.text) + (x.detail ? '<br><span style="color:#a33">' + esc(x.detail) + '</span>' : '') + '</td></tr>').join('')
    + '</table></div>';
  const send = o.sendMail || auth.sendMail;
  const ok = await send(to, ('صندوق المالك: ' + items.length + ' بلاغًا جديدًا من المستخدمين').slice(0, 120), html);
  if (ok) await kv.kvPutJSON(DIGEST_KEY, { sentAt: now, count: items.length });
  return { sent: !!ok, count: items.length };
}
/** /api/system?action=owner-inbox — GET القائمة (الأحدث أوّلًا) للمالك وحده؛ POST {action:'clear'} يمسحها. */
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { isOwnerSession } = require('./_owner.js'); // v-audit-agent (srv-agent-3): مقاطع رسائل المستخدمين بأسمائهم — لا MONITOR_KEY
  if (!isOwnerSession(req)) { res.status(403).json({ error: 'owner only' }); return; }
  const kv = require('./kv.js');
  if (req.method === 'POST') {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    if (b.action === 'clear') { await kv.kvPutJSON(LIST_KEY, { items: [] }); res.status(200).json({ ok: true, cleared: true }); return; }
    res.status(400).json({ error: 'action' }); return;
  }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const items = (await readList(kv)).slice().reverse();
  res.status(200).json({ items, count: items.length });
}
module.exports = handler;
Object.assign(module.exports, { classify, excerpt, scanTurn, noteFailure, record, dailyDigest, readList, KIND_LABEL, LIST_KEY, DIGEST_KEY, MAX_ITEMS, EXCERPT, PUSH_TTL_S, DEDUPE_MS });
