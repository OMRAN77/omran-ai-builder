// Vercel Serverless Function: «دروسي» (Edu Hub) — lecture → summary + flashcards + quiz.
// Actions (POST JSON, `action` field): process | save | list | get | delete | progress.
// Lessons persist per registered user in Upstash Redis (edu:lessons:{username}).
// Guests: `process` works (capped 3/day per IP), save/list/etc. return {guest:true}
// and the client falls back to localStorage.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');
const { installCors } = require('./_lib/cors.js');
// حارس الميزات المتقاعدة — يُفحص قبل أي تحميل وحدة أو استخدام مفتاح.
const { isRetired, retiredResponse } = require('./_lib/_retired.js');

const { verifyToken } = require('./_lib/auth.js');
const { kvGetJSON, kvPutJSON, kvIncr, kvExpire } = require('./_lib/kv.js');
const { clientIp } = require('./_lib/_usage.js');

// v-owner-core: قائمة المالك الموحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
const { isOwnerName } = require('./_lib/_owner.js');
const MODEL = 'claude-sonnet-5'; // keep in sync with api/_lib/claude.js
const MAX_BASE64_CHARS = 14 * 1024 * 1024; // ~14MB of base64 payload
const GUEST_PROCESS_PER_DAY = 3;
// Registered users were previously uncapped, and signing up takes two seconds
// with no email verification — so the guest cap was bypassable by anyone.
// Every analysis is a Claude call with a large PDF and a big output budget.
const USER_PROCESS_PER_DAY = Number(process.env.EDU_USER_DAILY || 25);
const USER_GRADE_PER_DAY = Number(process.env.EDU_GRADE_DAILY || 120);

/**
 * One daily counter per subject (ip or username) per bucket. Owner is exempt.
 * Returns true when the caller is over the limit.
 */
async function overDailyLimit(subject, bucket, max) {
  const key = 'edu:' + bucket + ':' + encodeURIComponent(subject) + ':' + todayStr();
  let count = 0;
  try {
    count = await kvIncr(key);
    if (count === 1) await kvExpire(key, 172800);
  } catch (e) {
    return false; // never block a student over a bookkeeping failure
  }
  return count > max;
}

function lessonsKey(u) { return 'edu:lessons:' + encodeURIComponent(u); }
function streakKey(u) { return 'edu:streak:' + encodeURIComponent(u); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

function lightLesson(l) {
  return {
    id: l.id,
    subject: l.subject,
    color: l.color,
    title: l.title,
    createdAt: l.createdAt,
    bestScore: typeof l.bestScore === 'number' ? l.bestScore : null,
    scores: l.scores && typeof l.scores === 'object' ? l.scores : {},
    cardsKnown: typeof l.cardsKnown === 'number' ? l.cardsKnown : 0,
    cardCount: Array.isArray(l.flashcards) ? l.flashcards.length : 0,
    quizCount: Array.isArray(l.quiz) ? l.quiz.length : 0,
  };
}

function extractJSON(text) {
  let s = String(text || '').trim();
  // strip ```json ... ``` fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch (e) { /* fall through */ }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (e) { /* fall through */ }
  }
  return null;
}

// Same fallback claude.js uses: if the pinned model 404s, pick the best
// available model from the account (prefer sonnet, then haiku).
let RESOLVED_MODEL = null;
async function resolveModel(apiKey) {
  if (RESOLVED_MODEL) return RESOLVED_MODEL;
  try {
    const listRes = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const ids = (listData.data || []).map((m) => m.id);
      RESOLVED_MODEL = ids.find((id) => /sonnet/i.test(id)) || ids.find((id) => /haiku/i.test(id)) || ids[0] || MODEL;
      return RESOLVED_MODEL;
    }
  } catch (e) { /* fall through */ }
  return MODEL;
}

// Language bridge: the student understands in one language but is examined in
// another (an Arabic-speaking med student sitting an English exam, a Malayalam
// speaker in an English-medium school). Explanations follow the native
// language; terms and quiz wording follow the exam language.
function languageRules(lang, nativeLang, examLang) {
  const native = (nativeLang || '').trim();
  const exam = (examLang || '').trim();
  if (native && exam && native !== exam) {
    return 'جسر اللغة — إلزامي: اشرح واكتب الملخص ووجه البطاقات بلغة الطالب الأم: ' + native + '. '
      + 'أمّا المصطلحات العلمية وأسئلة الاختبار وخياراته فبلغة الامتحان: ' + exam + '. '
      + 'في كل بطاقة مراجعة اذكر المصطلح باللغتين معًا بهذا الشكل: المصطلح بلغة الامتحان (المقابل بلغة الطالب). '
      + 'الهدف أن يفهم الطالب بلغته ويتعرّف على المصطلح كما سيراه في ورقة الامتحان.';
  }
  if (native) return 'اكتب كل شيء بلغة الطالب: ' + native + '.';
  return 'اكتب كل شيء (العنوان والمادة والملخص والبطاقات والاختبار) بنفس لغة محتوى المحاضرة نفسها'
    + (lang ? ' (وإن كان المحتوى نصًا قصيرًا غامض اللغة فاستخدم اللغة: ' + lang + ')' : '') + '.';
}

/* v-edu-split: شكوى المستخدمين «صفحة التعليم بطيئة جدًا» — التحليل كان نداءً
   واحدًا ضخمًا (ملخص + بطاقات + اختبار + مقالي معًا) يستغرق دقيقة وأكثر.
   الآن نداءان متوازيان على نفس المحتوى: الملخص | الأسئلة كلها — الزمن الكلي
   يصير زمن الأطول فقط (~النصف) بنفس المحتوى حرفيًا. */
async function anthropicJSON(apiKey, sys, contentBlocks, maxTokens) {
  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    // v407: مهلة خاصة 120ث — التحليل التعليمي الثقيل يتجاوز مهلة الـ30ث العامة
    signal: AbortSignal.timeout(280000),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: m,
      max_tokens: maxTokens,
      system: sys,
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });
  let res = await doRequest(RESOLVED_MODEL || MODEL);
  let data = await res.json().catch(() => null);
  if (!res.ok && res.status === 404 && data && data.error && /model/i.test(JSON.stringify(data.error))) {
    RESOLVED_MODEL = null;
    const m = await resolveModel(apiKey);
    res = await doRequest(m);
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const text = (data && data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return extractJSON(text);
}
function eduLangTail(lang, nativeLang, examLang, stage) {
  const level = (stage || 'university') === 'university' ? 'جامعي' : 'مدرسي مناسب لمرحلة: ' + stage;
  return '- مستوى الصياغة والعمق: ' + level + '.\n'
    + languageRules(lang, nativeLang, examLang)
    + ' لا تكتب أي شيء خارج كائن JSON.';
}
// v-edu-questions: نظام شقّ الأسئلة مستقل — يخدم التحليل الكامل وإنقاذ
// الدروس التي وصلت ببطاقات (0) واختبار (0) حين تعثّر شقّها الأول.
function buildQuestionsSys(langTail) {
  return 'أنت مساعد تعليمي خبير. يُرسل إليك محتوى محاضرة (نص أو PDF أو صور). '
    + 'ابنِ منه أسئلة وأعد فقط JSON صالحًا بلا أي نص خارجه وبلا أسوار كود، بهذا الشكل بالضبط:\n'
    + '{"flashcards":[{"q":"سؤال","a":"جواب"}],"quiz":[{"q":"سؤال","options":["أ","ب","ج","د"],"correct":0,"explain":"شرح قصير","level":"basic","section":"عنوان الجزء من المحاضرة"}],"written":[{"q":"سؤال مقالي قصير","rubric":["نقطة يجب أن ترد في الإجابة الكاملة"],"level":"mid","section":"عنوان الجزء من المحاضرة"}]}\n'
    + 'القواعد:\n'
    + '- flashcards بين 8 و14 بطاقة.\n'
    + '- quiz = 15 سؤالًا بالضبط: 5 بمستوى "basic" و5 بمستوى "mid" و5 بمستوى "advanced". لكل سؤال 4 خيارات بالضبط و"correct" رقم من 0 إلى 3.\n'
    + '- معنى المستويات (مهم جدًا — الفرق في نوع التفكير المطلوب لا في التعقيد اللغوي):\n'
    + '  basic = استدعاء وتذكّر: تعريف، مصطلح، صيغة، حقيقة وردت نصًا في المحاضرة.\n'
    + '  mid = تطبيق: يطبّق الطالب قاعدة أو خطوة على حالة مشابهة لما ورد في المحاضرة.\n'
    + '  advanced = فهم وتحليل: لماذا؟ ماذا يحدث لو تغيّر شرط؟ مقارنة، استنتاج، أو حالة لم ترد حرفيًا في المحاضرة لكنها تُشتق منها.\n'
    + '- ممنوع أن يكون سؤال advanced مجرد سؤال basic بصياغة أطول أو بأرقام أكبر. إن لم تجد مادة كافية لخمسة أسئلة advanced حقيقية فأعطِ ما تجده واملأ الباقي من mid.\n'
    + '- written = 3 أسئلة مقالية قصيرة (واحد لكل مستوى)، لكل سؤال "rubric" فيه 2 إلى 4 نقاط محدّدة يجب أن ترد في الإجابة الكاملة. النقاط ملموسة وقابلة للتحقق، لا عبارات عامة.\n'
    + '- "section" في كل سؤال = عنوان قصير للجزء من المحاضرة الذي يغطيه السؤال، ليُوجَّه الطالب لمراجعته عند الخطأ.\n'
    + langTail;
}
async function callClaude(apiKey, contentBlocks, lang, nativeLang, examLang, stage) {
  const langTail = eduLangTail(lang, nativeLang, examLang, stage);
  const sysSummary = 'أنت مساعد تعليمي خبير. يُرسل إليك محتوى محاضرة (نص أو PDF أو صور). '
    + 'حلل المحتوى وأعد فقط JSON صالحًا بلا أي نص خارجه وبلا أسوار كود، بهذا الشكل بالضبط:\n'
    + '{"title":"عنوان قصير للدرس","subject":"اسم المادة المقترح (كلمة أو كلمتان)","summary":"ملخص منظم بصيغة ماركداون (عناوين، نقاط، **غامق**) يغطي كل الأفكار المهمة"}\n'
    + langTail;
  const sysQuestions = buildQuestionsSys(langTail);
  const [sum, qs] = await Promise.all([
    anthropicJSON(apiKey, sysSummary, contentBlocks, 8000),
    // فشل شقّ الأسئلة وحده لا يُسقط الدرس — الملخص يصل والأسئلة تُستولد لاحقًا.
    anthropicJSON(apiKey, sysQuestions, contentBlocks, 9000).catch(() => null),
  ]);
  if (!sum || !sum.summary) return null;
  return {
    title: sum.title, subject: sum.subject, summary: sum.summary,
    flashcards: (qs && Array.isArray(qs.flashcards)) ? qs.flashcards : [],
    quiz: (qs && Array.isArray(qs.quiz)) ? qs.quiz : [],
    written: (qs && Array.isArray(qs.written)) ? qs.written : [],
  };
}
// ---------- ✍️ تصحيح إجابة مقالية مقابل معيار (نص فقط — رخيص) ----------
// Deliberately NOT a pass/fail verdict. A student learns from "you covered X,
// you missed Y, go re-read Z" — not from a number. The rubric is echoed back
// so the student can see what they were judged against and challenge it.
async function callClaudeGrade(apiKey, payload, lang, nativeLang) {
  const sys = 'أنت مصحّح تعليمي منصف. يُعطى إليك سؤال مقالي، ومعيار تصحيح (قائمة نقاط يجب أن ترد في الإجابة الكاملة)، وإجابة الطالب. '
    + 'قيّم الإجابة مقابل المعيار فقط. أعد JSON صالحًا بلا أي نص خارجه وبلا أسوار كود:\n'
    + '{"score":0,"max":10,"covered":["نقطة من المعيار وردت فعلًا في إجابة الطالب"],"missing":["نقطة من المعيار لم ترد"],"feedback":"ملاحظة قصيرة موجّهة للطالب","review":"عنوان القسم الذي يُنصح بمراجعته أو نص فارغ"}\n'
    + 'قواعد التصحيح:\n'
    + '- الدرجة من 10، وتُشتق من نسبة نقاط المعيار التي غطّاها الطالب فعلًا.\n'
    + '- صحّح المعنى لا الصياغة: إجابة صحيحة بكلمات مختلفة أو بترتيب مختلف تُحتسب كاملة. لا تخصم على الأسلوب أو الإملاء أو الطول.\n'
    + '- إن كانت الإجابة صحيحة وأضافت معلومة خارج المعيار فلا تخصم عليها.\n'
    + '- إن كانت الإجابة فارغة أو لا علاقة لها بالسؤال فالدرجة 0 وقل ذلك بلطف.\n'
    + '- خاطب الطالب مباشرة بصيغة مشجّعة ومحدّدة، لا عبارات عامة مثل "إجابة جيدة".\n'
    + '- اكتب كل النصوص بلغة إجابة الطالب' + (nativeLang ? ' (لغته: ' + nativeLang + ')' : (lang ? ' (اللغة: ' + lang + ')' : '')) + '.\n'
    + 'لا تكتب أي شيء خارج كائن JSON.';

  const user = 'السؤال:\n' + String(payload.question || '').slice(0, 4000)
    + '\n\nمعيار التصحيح (النقاط المطلوبة):\n'
    + (Array.isArray(payload.rubric) ? payload.rubric : []).map((r, i) => (i + 1) + '. ' + String(r).slice(0, 500)).join('\n')
    + '\n\nإجابة الطالب:\n"""\n' + String(payload.answer || '').slice(0, 8000) + '\n"""'
    + (payload.dispute ? '\n\nاعتراض الطالب على تصحيح سابق (أعد التقييم بإنصاف وخذه بجدية):\n' + String(payload.dispute).slice(0, 1500) : '');

  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    // v407: مهلة خاصة 120ث — التحليل التعليمي الثقيل يتجاوز مهلة الـ30ث العامة
    signal: AbortSignal.timeout(280000),
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 2000, system: sys, messages: [{ role: 'user', content: user }] }),
  });
  let res = await doRequest(RESOLVED_MODEL || MODEL);
  let data = await res.json().catch(() => null);
  if (!res.ok && res.status === 404 && data && data.error && /model/i.test(JSON.stringify(data.error))) {
    RESOLVED_MODEL = null; const m = await resolveModel(apiKey); res = await doRequest(m); data = await res.json().catch(() => null);
  }
  if (!res.ok) { const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status); const err = new Error(msg); err.status = res.status; throw err; }
  const text = (data && data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return extractJSON(text);
}

// ---------- 📊 محلّل المصاريف: يقرأ كشف حساب (PDF/صور/نص) ويصنّف المصاريف ----------
async function callClaudeExpense(apiKey, contentBlocks, lang) {
  const sys = 'أنت محلل مالي شخصي خبير. يُرسل إليك كشف حساب بنكي أو قائمة مصاريف (نص أو PDF أو صور). '
    + 'اقرأ كل الحركات المالية المصروفة (تجاهل الإيداعات/الرواتب الداخلة إلا لحساب صافي التدفق)، وصنّفها في فئات واضحة. '
    + 'أعد فقط JSON صالحًا بلا أي نص خارجه وبلا أسوار كود، بهذا الشكل بالضبط:\n'
    + '{"currency":"رمز أو اسم العملة كما ظهر (مثل AED أو درهم)","period":"الفترة الزمنية للكشف إن وُجدت وإلا فارغ","total":0,"txCount":0,"categories":[{"name":"اسم الفئة","icon":"إيموجي واحد مناسب","amount":0,"pct":0,"count":0}],"biggest":{"name":"أكبر مصروف مفرد","amount":0},"tips":["نصيحة توفير عملية مبنية على الأرقام الفعلية"]}\n'
    + 'القواعد: '
    + 'total = مجموع كل المصاريف. '
    + 'categories مرتبة تنازليًا حسب amount، بين 4 و8 فئات (مثل: طعام ومطاعم، تسوّق، بنزين ومواصلات، فواتير واشتراكات، صحة، ترفيه، تحويلات، أخرى). '
    + 'pct = نسبة الفئة من الإجمالي كرقم صحيح تقريبي (0-100). '
    + 'count = عدد الحركات في الفئة. '
    + 'tips بين 3 و5 نصائح، كل نصيحة مبنية فعليًا على الأرقام (اذكر المبالغ/الفئات الحقيقية)، عملية وقصيرة. '
    + 'إذا كان المحتوى ليس كشف حساب أو مصاريف إطلاقًا، أعِد {"error":"هذا الملف لا يبدو كشف حساب أو قائمة مصاريف"}. '
    + 'اكتب كل النصوص (أسماء الفئات والنصائح) '
    + (lang && /^ar/i.test(lang) ? 'بالعربية.' : ('باللغة: ' + (lang || 'ar') + '.'))
    + ' لا تكتب أي شيء خارج كائن JSON.';
  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    // v407: مهلة خاصة 120ث — التحليل التعليمي الثقيل يتجاوز مهلة الـ30ث العامة
    signal: AbortSignal.timeout(280000),
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 8000, system: sys, messages: [{ role: 'user', content: contentBlocks }] }),
  });
  let res = await doRequest(RESOLVED_MODEL || MODEL);
  let data = await res.json().catch(() => null);
  if (!res.ok && res.status === 404 && data && data.error && /model/i.test(JSON.stringify(data.error))) {
    RESOLVED_MODEL = null;
    const m = await resolveModel(apiKey);
    res = await doRequest(m);
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
    const err = new Error(msg); err.status = res.status; throw err;
  }
  const text = (data && data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return extractJSON(text);
}

module.exports = withErrorCapture('edu', async (req, res) => {
  installCors(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const action = body.action || '';
    // حارس الميزات المتقاعدة — 410 قبل أي استخدام مفتاح (docqa/docask/gov/cv).
    if (isRetired(action)) { retiredResponse(res, action); return; }
    const username = body.token ? verifyToken(body.token) : null;
    const isOwner = isOwnerName(username);

    // ---------------- process ----------------
    if (action === 'process') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }

      // Daily cap. Guests are limited by IP, registered users by account, and
      // only the owner is exempt.
      if (!isOwner) {
        const subject = username || ((typeof clientIp === 'function' && clientIp(req)) || 'unknown');
        const max = username ? USER_PROCESS_PER_DAY : GUEST_PROCESS_PER_DAY;
        if (await overDailyLimit(subject, 'proc', max)) {
          res.status(402).json({
            error: username
              ? 'وصلت للحد اليومي (' + max + ' محاضرة). عد غدًا 🌙'
              : 'وصلت للحد اليومي المجاني (' + max + ' محاضرات). سجّل الدخول أو عد غدًا 🌙',
          });
          return;
        }
      }

      const { fileBase64, mime, text, images, lang, nativeLang, examLang, stage } = body;
      let totalB64 = (fileBase64 || '').length;
      if (Array.isArray(images)) images.forEach((im) => { totalB64 += ((im && im.base64) || '').length; });
      if (totalB64 > MAX_BASE64_CHARS) {
        res.status(413).json({ error: 'حجم الملف كبير جدًا (الحد الأقصى حوالي 10 ميغابايت). جرّب ملفًا أصغر أو صورًا أقل.' });
        return;
      }

      const blocks = [];
      if (fileBase64 && /pdf/i.test(mime || '')) {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } });
      } else if (fileBase64 && /^image\//i.test(mime || '')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: mime, data: fileBase64 } });
      }
      if (Array.isArray(images)) {
        images.slice(0, 10).forEach((im) => {
          if (im && im.base64) blocks.push({ type: 'image', source: { type: 'base64', media_type: im.mime || 'image/jpeg', data: im.base64 } });
        });
      }
      if (text && String(text).trim()) {
        blocks.push({ type: 'text', text: 'محتوى المحاضرة:\n\n' + String(text).slice(0, 200000) });
      }
      if (!blocks.length) { res.status(400).json({ error: 'لا يوجد محتوى للتحليل — ارفع ملفًا أو الصق نصًا.' }); return; }
      blocks.push({ type: 'text', text: 'حلل هذه المحاضرة وأعد JSON فقط بالصيغة المطلوبة.' });

      let result = null;
      try {
        result = await callClaude(apiKey, blocks, lang, nativeLang, examLang, stage);
      } catch (e) {
        res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر تحليل المحاضرة: ' + (e.message || 'خطأ في الخادم') + ' — حاول مرة أخرى.' });
        return;
      }
      if (!result || !result.summary || !Array.isArray(result.flashcards) || !Array.isArray(result.quiz)) {
        res.status(502).json({ error: 'تعذر فهم رد الذكاء الاصطناعي — حاول مرة أخرى.' });
        return;
      }
      // sanitize quiz shape
      result.quiz = result.quiz.filter((q) => q && q.q && Array.isArray(q.options) && q.options.length === 4 && q.correct >= 0 && q.correct <= 3);
      result.flashcards = result.flashcards.filter((c) => c && c.q && c.a);
      res.status(200).json({ ok: true, lesson: result, guest: !username });
      return;
    }

    // ---------------- 📚 explain: درس من المنهج (بلد/مرحلة/صف/مادة/درس) — v655 ----------------
    if (action === 'explain') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      if (!isOwner) {
        const subject = username || ((typeof clientIp === 'function' && clientIp(req)) || 'unknown');
        const max = username ? USER_PROCESS_PER_DAY : GUEST_PROCESS_PER_DAY;
        if (await overDailyLimit(subject, 'proc', max)) {
          res.status(402).json({
            error: username
              ? 'وصلت للحد اليومي (' + max + ' درسًا). عد غدًا 🌙'
              : 'وصلت للحد اليومي المجاني (' + max + ' دروس). سجّل الدخول أو عد غدًا 🌙',
          });
          return;
        }
      }
      const country = String(body.country || '').slice(0, 60).trim();
      const stageTxt = String(body.stage || '').slice(0, 60).trim();
      const grade = String(body.grade || '').slice(0, 60).trim();
      const subjName = String(body.subject || '').slice(0, 80).trim();
      const lessonName = String(body.lesson || '').slice(0, 200).trim();
      if (!subjName || !lessonName) { res.status(400).json({ error: 'اكتب المادة واسم الدرس على الأقل.' }); return; }
      const blocks = [{ type: 'text', text: 'لا توجد محاضرة مرفوعة هذه المرة. أنت مدرّس خبير بالمناهج الدراسية، والمطلوب أن تؤلّف درسًا تعليميًا كاملًا وفق المواصفات التالية:\n'
        + (country ? '- البلد/المنهج: ' + country + ' (التزم بمصطلحات المنهج الرسمي لهذا البلد قدر معرفتك، ولا تختلق أرقام وحدات أو صفحات إن لم تتأكد).\n' : '')
        + (stageTxt ? '- المرحلة: ' + stageTxt + '\n' : '')
        + (grade ? '- الصف/السنة: ' + grade + '\n' : '')
        + '- المادة: ' + subjName + '\n- عنوان الدرس: ' + lessonName + '\n'
        + 'في حقل "summary" اكتب شرح الدرس كاملًا كأنه فصل من كتاب مدرسي: تمهيد يربط الدرس بما قبله، شرح كل فكرة بالتفصيل مع أمثلة محلولة خطوة بخطوة، القوانين والقواعد بارزة بخط غامق، ثم خلاصة — بمستوى يناسب الصف المحدد بالضبط. واجعل حقل "subject" هو: ' + subjName + '. ثم ولّد البطاقات والاختبار والأسئلة المقالية من هذا الشرح نفسه.' }];
      let result = null;
      try {
        result = await callClaude(apiKey, blocks, body.lang, body.nativeLang, body.examLang, (stageTxt && /جامع|كلي|university|college/i.test(stageTxt)) ? 'university' : ((stageTxt + ' ' + grade).trim() || 'school'));
      } catch (e) {
        res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر توليد الدرس: ' + (e.message || 'خطأ في الخادم') + ' — حاول مرة أخرى.' });
        return;
      }
      if (!result || !result.summary || !Array.isArray(result.flashcards) || !Array.isArray(result.quiz)) {
        res.status(502).json({ error: 'تعذر فهم رد الذكاء الاصطناعي — حاول مرة أخرى.' });
        return;
      }
      result.quiz = result.quiz.filter((q) => q && q.q && Array.isArray(q.options) && q.options.length === 4 && q.correct >= 0 && q.correct <= 3);
      result.flashcards = result.flashcards.filter((c) => c && c.q && c.a);
      if (!result.subject) result.subject = subjName;
      res.status(200).json({ ok: true, lesson: result, guest: !username });
      return;
    }

    // ---------------- 🩹 questions: إنقاذ درس ببطاقات (0) — توليد الأسئلة وحدها من الملخص ----------------
    if (action === 'questions') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      const qSummary = String(body.summary || '').slice(0, 60000).trim();
      if (!qSummary) { res.status(400).json({ error: 'لا يوجد ملخص لتوليد الأسئلة منه.' }); return; }
      if (!isOwner) {
        const subject = username || ((typeof clientIp === 'function' && clientIp(req)) || 'unknown');
        const max = username ? USER_PROCESS_PER_DAY : GUEST_PROCESS_PER_DAY;
        if (await overDailyLimit(subject, 'proc', max)) { res.status(402).json({ error: 'وصلت للحد اليومي. عد غدًا 🌙' }); return; }
      }
      const qTail = eduLangTail(body.lang, body.nativeLang, body.examLang, body.stage || 'university');
      let qResult = null;
      try {
        qResult = await anthropicJSON(apiKey, buildQuestionsSys(qTail),
          [{ type: 'text', text: 'محتوى المحاضرة (ملخص الدرس):\n\n' + qSummary }], 9000);
      } catch (e) {
        res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر توليد الأسئلة: ' + (e.message || 'خطأ') + ' — حاول مرة أخرى.' });
        return;
      }
      if (!qResult || !Array.isArray(qResult.quiz) || !qResult.quiz.length) {
        res.status(502).json({ error: 'تعذر توليد الأسئلة — أعد المحاولة.' });
        return;
      }
      qResult.quiz = qResult.quiz.filter((q) => q && q.q && Array.isArray(q.options) && q.options.length === 4 && q.correct >= 0 && q.correct <= 3);
      qResult.flashcards = (qResult.flashcards || []).filter((c) => c && c.q && c.a);
      res.status(200).json({ ok: true, flashcards: qResult.flashcards, quiz: qResult.quiz, written: Array.isArray(qResult.written) ? qResult.written : [] });
      return;
    }

    // ---------------- 🧪 lab: الدرس الحي — تجربة تفاعلية مولّدة من الدرس (v-edu-lab) ----------------
    if (action === 'lab') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      const lessonId = String(body.id || '').slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '');
      const labKey = (username && lessonId) ? ('db/edu/labs/' + encodeURIComponent(username) + '/' + lessonId + '.json') : null;
      // المختبر المحفوظ يُعاد بلا استهلاك حصة ولا نداء نموذج
      if (labKey && !body.force) {
        try {
          const cached = await kvGetJSON(labKey);
          if (cached && cached.html) { res.status(200).json({ ok: true, html: cached.html, cached: true }); return; }
        } catch (e) { /* best-effort: الكاش رفاهية — التوليد يغطي */ }
      }
      if (!isOwner) {
        const subject = username || ((typeof clientIp === 'function' && clientIp(req)) || 'unknown');
        const max = username ? USER_PROCESS_PER_DAY : GUEST_PROCESS_PER_DAY;
        if (await overDailyLimit(subject, 'proc', max)) {
          res.status(402).json({ error: 'وصلت للحد اليومي. عد غدًا 🌙' });
          return;
        }
      }
      const title = String(body.title || '').slice(0, 160).trim();
      const subjName = String(body.subject || '').slice(0, 80).trim();
      const summary = String(body.summary || '').slice(0, 14000).trim();
      if (!title || !summary) { res.status(400).json({ error: 'الدرس غير مكتمل — حلّل المحاضرة أولًا.' }); return; }
      const nat = String(body.nativeLang || body.lang || 'ar').slice(0, 8);
      const sys = 'أنت مطوّر ألعاب تعليمية عبقري. يُعطى إليك ملخص درس، ومطلوب منك بناء «تجربة حية»: '
        + 'صفحة HTML واحدة كاملة تفاعلية تجعل الطالب يلعب بجوهر الدرس بيديه ويرى النتيجة فورًا.\n'
        + 'قواعد إلزامية:\n'
        + '1. ملف HTML واحد كامل (doctype + head + body) يعمل فورًا بلا إنترنت: لا مكتبات خارجية، لا صور خارجية، لا خطوط خارجية — CSS وJS مدمجان.\n'
        + '2. ممنوع script type=module. السكربت عادي في نهاية body. أي دالة أحداث معرفة globally أو مربوطة بـaddEventListener في نهاية السكربت. كل زر يعمل فعلًا.\n'
        + '3. تفاعل حقيقي بجوهر الدرس: منزلقات/سحب/أزرار تغيّر معاملات المفهوم الأساسي (قانون، معادلة، دورة، عملية) ورسم أو محاكاة تتحدث فورًا مع كل تغيير — ليست عرض شرائح ولا نصًا يُقرأ.\n'
        + '4. وضع تحدٍّ صغير: بعد اللعب الحر، زر «تحدّي» يطرح 3 مهام قصيرة داخل التجربة نفسها (اضبط القيمة لتحقق كذا…) مع نقاط وتشجيع.\n'
        + '5. تصميم عصري جميل: خلفية داكنة أنيقة، ألوان ذهبية مميزة، أرقام كبيرة واضحة، متجاوب للجوال (أزرار كبيرة للمس، لا سكرول أفقي).\n'
        + '6. لغة الواجهة: ' + nat + (/^ar/i.test(nat) ? ' مع اتجاه rtl.' : '.') + '\n'
        + '7. الكود مركّز وأنيق بحد أقصى نحو 500 سطر — تجربة واحدة متقنة خير من صفحة متخمة.\n'
        + '8. أعد فقط كتلة ```html واحدة فيها الملف كاملًا — لا شرح قبلها ولا بعدها.';
      const user = 'المادة: ' + (subjName || 'عام') + '\nعنوان الدرس: ' + title + '\n\nملخص الدرس:\n' + summary
        + '\n\nابنِ التجربة الحية الآن — اختر أهم مفهوم قابل للمحاكاة في هذا الدرس بالذات واجعله ملموسًا.';
      const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(280000),
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: m, max_tokens: 14000, system: sys, messages: [{ role: 'user', content: user }] }),
      });
      let r2 = await doRequest(RESOLVED_MODEL || MODEL);
      let d2 = await r2.json().catch(() => null);
      if (!r2.ok && r2.status === 404 && d2 && d2.error && /model/i.test(JSON.stringify(d2.error))) {
        RESOLVED_MODEL = null; const m = await resolveModel(apiKey); r2 = await doRequest(m); d2 = await r2.json().catch(() => null);
      }
      if (!r2.ok) {
        const msg = (d2 && d2.error && d2.error.message) || ('HTTP ' + r2.status);
        res.status(r2.status === 429 ? 429 : 502).json({ error: 'تعذر بناء التجربة: ' + msg + ' — حاول مرة أخرى.' });
        return;
      }
      const raw = (d2 && d2.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      let html = '';
      const fence = raw.match(/```html\s*([\s\S]*?)```/i);
      if (fence) html = fence[1].trim();
      else if (/^\s*<!doctype|^\s*<html/i.test(raw)) html = raw.trim();
      if (!html || html.length < 500 || html.length > 200000 || !/<\/html>\s*$/i.test(html)) {
        res.status(502).json({ error: 'وصلت تجربة غير مكتملة من النموذج — أعد المحاولة.' });
        return;
      }
      if (labKey) { try { await kvPutJSON(labKey, { html, at: Date.now() }); } catch (e) { /* best-effort: يبقى الرد للعميل */ } }
      res.status(200).json({ ok: true, html });
      return;
    }

    // ---------------- 📊 expense analyzer ----------------
    if (action === 'expense') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }

      if (!username) {
        const ip = (typeof clientIp === 'function' && clientIp(req)) || 'unknown';
        const key = 'exp:proc:' + encodeURIComponent(ip) + ':' + todayStr();
        let count = 0;
        try { count = await kvIncr(key); if (count === 1) await kvExpire(key, 172800); } catch (e) { count = 0; }
        if (count > GUEST_PROCESS_PER_DAY) {
          res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + GUEST_PROCESS_PER_DAY + ' كشوفات). سجّل الدخول أو عد غدًا 🌙' });
          return;
        }
      }

      const { fileBase64, mime, text, images, lang } = body;
      let totalB64 = (fileBase64 || '').length;
      if (Array.isArray(images)) images.forEach((im) => { totalB64 += ((im && im.base64) || '').length; });
      if (totalB64 > MAX_BASE64_CHARS) {
        res.status(413).json({ error: 'حجم الملف كبير جدًا (الحد الأقصى حوالي 10 ميغابايت). جرّب ملفًا أصغر.' });
        return;
      }

      const blocks = [];
      if (fileBase64 && /pdf/i.test(mime || '')) {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } });
      } else if (fileBase64 && /^image\//i.test(mime || '')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: mime, data: fileBase64 } });
      }
      if (Array.isArray(images)) {
        images.slice(0, 10).forEach((im) => {
          if (im && im.base64) blocks.push({ type: 'image', source: { type: 'base64', media_type: im.mime || 'image/jpeg', data: im.base64 } });
        });
      }
      if (text && String(text).trim()) {
        blocks.push({ type: 'text', text: 'قائمة المصاريف / كشف الحساب:\n\n' + String(text).slice(0, 200000) });
      }
      if (!blocks.length) { res.status(400).json({ error: 'لا يوجد محتوى للتحليل — ارفع كشف حساب أو الصق قائمة المصاريف.' }); return; }
      blocks.push({ type: 'text', text: 'حلّل هذه المصاريف وأعد JSON فقط بالصيغة المطلوبة.' });

      let result = null;
      try {
        result = await callClaudeExpense(apiKey, blocks, lang);
      } catch (e) {
        res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر تحليل الكشف: ' + (e.message || 'خطأ في الخادم') + ' — حاول مرة أخرى.' });
        return;
      }
      if (result && result.error) { res.status(422).json({ error: result.error }); return; }
      if (!result || typeof result.total === 'undefined' || !Array.isArray(result.categories) || !result.categories.length) {
        res.status(502).json({ error: 'تعذر فهم رد الذكاء الاصطناعي — تأكد أن الملف كشف حساب واضح وحاول مرة أخرى.' });
        return;
      }
      result.categories = result.categories
        .filter((c) => c && c.name && typeof c.amount === 'number')
        .map((c) => ({ name: String(c.name), icon: String(c.icon || '💵').slice(0, 4), amount: Math.round(c.amount * 100) / 100, pct: Math.max(0, Math.min(100, Math.round(c.pct || 0))), count: c.count || 0 }));
      result.tips = Array.isArray(result.tips) ? result.tips.filter((t) => t && String(t).trim()).slice(0, 5) : [];
      res.status(200).json({ ok: true, report: result, guest: !username });
      return;
    }

    // ---------------- ✍️ grade a written answer against its rubric ----------------
    if (action === 'grade') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }

      const { question, rubric, answer, dispute, lang, nativeLang } = body;
      if (!question || !Array.isArray(rubric) || !rubric.length) {
        res.status(400).json({ error: 'ناقص السؤال أو معيار التصحيح.' });
        return;
      }
      if (typeof answer !== 'string' || !answer.trim()) {
        res.status(400).json({ error: 'اكتب إجابتك أولًا.' });
        return;
      }

      // Grading is cheap per call but trivially loopable — cap it like process.
      if (!isOwner) {
        const subject = username || ((typeof clientIp === 'function' && clientIp(req)) || 'unknown');
        const cap = username ? USER_GRADE_PER_DAY : 10;
        if (await overDailyLimit(subject, 'grade', cap)) {
          res.status(402).json({ error: 'وصلت للحد اليومي للتصحيح (' + cap + '). عد غدًا 🌙' });
          return;
        }
      }

      let result = null;
      try {
        result = await callClaudeGrade(apiKey, { question, rubric, answer, dispute }, lang, nativeLang);
      } catch (e) {
        res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذّر التصحيح: ' + (e.message || 'خطأ') + ' — حاول مرة أخرى.' });
        return;
      }
      if (!result || typeof result.score !== 'number') {
        res.status(502).json({ error: 'تعذّر قراءة نتيجة التصحيح. حاول مرة أخرى.' });
        return;
      }

      const MAXG = 10;
      res.status(200).json({
        ok: true,
        grade: {
          score: Math.max(0, Math.min(MAXG, Math.round(result.score))),
          max: MAXG,
          covered: Array.isArray(result.covered) ? result.covered.slice(0, 8) : [],
          missing: Array.isArray(result.missing) ? result.missing.slice(0, 8) : [],
          feedback: String(result.feedback || '').slice(0, 1200),
          review: String(result.review || '').slice(0, 200),
          // Echoed back so the student can see what they were judged against.
          rubric: rubric.slice(0, 8),
        },
      });
      return;
    }

    // ---------------- persistence actions ----------------
    if (['save', 'list', 'get', 'delete', 'progress'].includes(action)) {
      if (!username) { res.status(200).json({ guest: true }); return; }
      const key = lessonsKey(username);
      let lessons = (await kvGetJSON(key)) || [];
      if (!Array.isArray(lessons)) lessons = [];

      if (action === 'save') {
        const l = body.lesson || {};
        if (!l.title || !l.summary) { res.status(400).json({ error: 'درس غير مكتمل' }); return; }
        const lesson = {
          id: l.id || ('l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
          subject: String(l.subject || 'عام').slice(0, 60),
          color: typeof l.color === 'number' ? l.color : 0,
          title: String(l.title).slice(0, 160),
          summary: String(l.summary).slice(0, 60000),
          flashcards: Array.isArray(l.flashcards) ? l.flashcards.slice(0, 30) : [],
          quiz: Array.isArray(l.quiz) ? l.quiz.slice(0, 24) : [],
          written: Array.isArray(l.written) ? l.written.slice(0, 6) : [],
          createdAt: l.createdAt || Date.now(),
          bestScore: typeof l.bestScore === 'number' ? l.bestScore : null,
          // One number hides the thing that matters: a student can score 70%
          // overall while understanding none of the "why". Kept per level.
          scores: l.scores && typeof l.scores === 'object' ? l.scores : {},
          cardsKnown: typeof l.cardsKnown === 'number' ? l.cardsKnown : 0,
        };
        lessons = lessons.filter((x) => x.id !== lesson.id);
        lessons.unshift(lesson);
        if (lessons.length > 120) lessons = lessons.slice(0, 120);
        await kvPutJSON(key, lessons);
        // streak update (server-side merge)
        try {
          const st = (await kvGetJSON(streakKey(username))) || { streak: 0, lastActive: '' };
          const today = todayStr();
          if (st.lastActive !== today) {
            const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            st.streak = (st.lastActive === y) ? (st.streak || 0) + 1 : 1;
            st.lastActive = today;
            await kvPutJSON(streakKey(username), st);
          }
        } catch (e) { /* best-effort */ }
        res.status(200).json({ ok: true, id: lesson.id });
        return;
      }

      if (action === 'list') {
        const streak = (await kvGetJSON(streakKey(username))) || { streak: 0, lastActive: '' };
        res.status(200).json({ ok: true, lessons: lessons.map(lightLesson), streak });
        return;
      }

      if (action === 'get') {
        const found = lessons.find((x) => x.id === body.id);
        if (!found) { res.status(404).json({ error: 'الدرس غير موجود' }); return; }
        res.status(200).json({ ok: true, lesson: found });
        return;
      }

      if (action === 'delete') {
        const next = lessons.filter((x) => x.id !== body.id);
        await kvPutJSON(key, next);
        // v-edu-lab: مختبر الدرس المحذوف يُنظف معه
        try {
          const lid = String(body.id || '').slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '');
          if (lid) await require('./_lib/kv.js').kvDel('db/edu/labs/' + encodeURIComponent(username) + '/' + lid + '.json');
        } catch (e) { /* best-effort: بقايا مختبر يتيمة لا تضر */ }
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'progress') {
        const found = lessons.find((x) => x.id === body.id);
        if (!found) { res.status(404).json({ error: 'الدرس غير موجود' }); return; }
        if (typeof body.bestScore === 'number') {
          found.bestScore = Math.max(found.bestScore || 0, Math.max(0, Math.min(100, Math.round(body.bestScore))));
        }
        if (typeof body.cardsKnown === 'number') {
          found.cardsKnown = Math.max(0, Math.min(999, Math.round(body.cardsKnown)));
        }
        if (body.scores && typeof body.scores === 'object') {
          // Best-ever per level, so one bad night never erases real progress.
          found.scores = found.scores && typeof found.scores === 'object' ? found.scores : {};
          for (const lvl of ['basic', 'mid', 'advanced']) {
            const v = body.scores[lvl];
            if (typeof v === 'number' && Number.isFinite(v)) {
              const pct = Math.max(0, Math.min(100, Math.round(v)));
              found.scores[lvl] = Math.max(found.scores[lvl] || 0, pct);
            }
          }
        }
        await kvPutJSON(key, lessons);
        // streak on any activity
        try {
          const st = (await kvGetJSON(streakKey(username))) || { streak: 0, lastActive: '' };
          const today = todayStr();
          if (st.lastActive !== today) {
            const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            st.streak = (st.lastActive === y) ? (st.streak || 0) + 1 : 1;
            st.lastActive = today;
            await kvPutJSON(streakKey(username), st);
          }
          res.status(200).json({ ok: true, streak: st });
          return;
        } catch (e) {
          res.status(200).json({ ok: true });
          return;
        }
      }
    }

    res.status(400).json({ error: 'unknown action: ' + action });
  } catch (e) {
    const __m = (e && e.message ? e.message : String(e));
    // v-edu-timeouts: مهلة التوليد تُشرح بالعربي لا بخطأ إنجليزي خام.
    if (/timeout|abort/i.test(__m)) { res.status(504).json({ error: 'التوليد أخذ وقتًا أطول من المتوقع — أعد المحاولة الآن، غالبًا تنجح فورًا.' }); return; }
    res.status(500).json({ error: 'Edu error: ' + __m });
  }
});
