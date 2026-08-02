// Vercel Serverless Function: «دروسي» (Edu Hub) — lecture → summary + flashcards + quiz.
// Actions (POST JSON, `action` field): process | save | list | get | delete | progress.
// Lessons persist per registered user in Upstash Redis (edu:lessons:{username}).
// Guests: `process` works (capped 3/day per IP), save/list/etc. return {guest:true}
// and the client falls back to localStorage.
const { verifyToken } = require('./_lib/auth.js');
const { kvGetJSON, kvPutJSON, kvIncr, kvExpire } = require('./_lib/kv.js');
const { clientIp } = require('./_lib/_usage.js');

const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();
const MODEL = 'claude-sonnet-4-20250514'; // keep in sync with api/_lib/claude.js
const MAX_BASE64_CHARS = 14 * 1024 * 1024; // ~14MB of base64 payload
const GUEST_PROCESS_PER_DAY = 3;

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

async function callClaude(apiKey, contentBlocks, lang) {
  const sys = 'أنت مساعد تعليمي خبير. يُرسل إليك محتوى محاضرة (نص أو PDF أو صور). '
    + 'حلل المحتوى وأعد فقط JSON صالحًا بلا أي نص خارجه وبلا أسوار كود، بهذا الشكل بالضبط:\n'
    + '{"title":"عنوان قصير للدرس","subject":"اسم المادة المقترح (كلمة أو كلمتان)","summary":"ملخص منظم بصيغة ماركداون (عناوين، نقاط، **غامق**) يغطي كل الأفكار المهمة","flashcards":[{"q":"سؤال","a":"جواب"}],"quiz":[{"q":"سؤال","options":["أ","ب","ج","د"],"correct":0,"explain":"شرح قصير"}]}\n'
    + 'القواعد: flashcards بين 8 و14 بطاقة. quiz بين 8 و12 سؤالًا، ولكل سؤال 4 خيارات بالضبط و"correct" رقم من 0 إلى 3. '
    + 'اكتب كل شيء (العنوان والمادة والملخص والبطاقات والاختبار) بنفس لغة محتوى المحاضرة نفسها'
    + (lang ? ' (وإن كان المحتوى نصًا قصيرًا غامض اللغة فاستخدم اللغة: ' + lang + ')' : '')
    + '. لا تكتب أي شيء خارج كائن JSON.';
  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: m,
      max_tokens: 12000,
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

// ---------- 📄 مساعد المستندات: يلخّص عقد/فاتورة/تقرير/عرض سعر ويستخرج نقاطه ----------
async function callClaudeDoc(apiKey, contentBlocks, lang) {
  const sys = 'أنت مساعد قانوني وإداري خبير. يُرسل إليك مستند (عقد، فاتورة، تقرير، عرض سعر، خطاب رسمي...) كنص أو PDF أو صور. '
    + 'اقرأه بدقة واستخرج جوهره. أعد فقط JSON صالحًا بلا أي نص خارجه وبلا أسوار كود، بهذا الشكل بالضبط:\n'
    + '{"title":"عنوان قصير يصف المستند","docType":"نوع المستند (عقد/فاتورة/تقرير/عرض سعر/خطاب/أخرى)","summary":"ملخص واضح بصيغة ماركداون (نقاط، **غامق**) يغطي الغرض والأطراف والالتزامات الرئيسية","keypoints":["أهم النقاط والبنود التي يجب الانتباه لها، خصوصًا الغرامات والشروط الجزائية والمواعيد"],"fields":[{"label":"اسم الحقل (مثل: المبلغ الإجمالي، تاريخ الانتهاء، الطرف الأول، رقم الفاتورة)","value":"القيمة كما وردت"}],"docText":"النص الكامل المستخرج من المستند بالكامل (لاستخدامه لاحقًا في الأسئلة)"}\n'
    + 'القواعد: keypoints بين 3 و8 نقاط. fields أهم 4-10 بيانات ملموسة (مبالغ، تواريخ، أطراف، أرقام مرجعية). '
    + 'docText = انسخ كل النص المقروء من المستند حرفيًا قدر الإمكان (حتى 20000 حرف). '
    + 'إن لم تجد قيمة لحقل، لا تخترعها — اتركه. لا تخمّن أرقامًا غير موجودة. '
    + 'اكتب النصوص '
    + (lang && /^ar/i.test(lang) ? 'بالعربية.' : ('باللغة: ' + (lang || 'ar') + '.'))
    + ' لا تكتب أي شيء خارج كائن JSON.';
  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 12000, system: sys, messages: [{ role: 'user', content: contentBlocks }] }),
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
// ---------- 📄 سؤال متابعة على مستند سبق تحليله (نص فقط — رخيص) ----------
async function callClaudeDocAsk(apiKey, docText, question, history, lang) {
  const sys = 'أنت مساعد يجيب على أسئلة المستخدم حول مستند محدّد أُرسل إليك نصه فقط. '
    + 'اعتمد حصريًا على نص المستند — لا تخترع معلومات غير موجودة فيه. '
    + 'إذا لم تكن المعلومة في المستند قل بصراحة إنها غير مذكورة. '
    + 'أجب باختصار وبدقة وبنفس لغة سؤال المستخدم'
    + (lang && /^ar/i.test(lang) ? ' (العربية افتراضيًا).' : ('. اللغة الافتراضية: ' + (lang || 'ar') + '.'));
  const msgs = [];
  if (Array.isArray(history)) history.slice(-6).forEach((h) => { if (h && h.role && h.content) msgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 4000) }); });
  msgs.push({ role: 'user', content: 'نص المستند:\n"""\n' + String(docText || '').slice(0, 60000) + '\n"""\n\nسؤالي: ' + String(question || '').slice(0, 2000) });
  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 2000, system: sys, messages: msgs }),
  });
  let res = await doRequest(RESOLVED_MODEL || MODEL);
  let data = await res.json().catch(() => null);
  if (!res.ok && res.status === 404) { RESOLVED_MODEL = null; const m = await resolveModel(apiKey); res = await doRequest(m); data = await res.json().catch(() => null); }
  if (!res.ok) { const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status); const err = new Error(msg); err.status = res.status; throw err; }
  return (data && data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
// ---------- 🧾 بحث Tavily مصغّر (للمعاملات الحكومية) ----------
async function tavilySearchGov(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query: query, country: 'united arab emirates', search_depth: 'advanced', include_answer: true, max_results: 6 }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
// ---------- 🧾 مساعد المعاملات الحكومية: خطوات + رسوم + رابط رسمي (ببحث حي) ----------
async function callClaudeGov(apiKey, query, searchData, lang) {
  const results = (searchData && Array.isArray(searchData.results) ? searchData.results : [])
    .map((r, i) => (i + 1) + '. ' + (r.title || '') + '\n   ' + (r.url || '') + '\n   ' + String(r.content || '').slice(0, 500)).join('\n\n');
  const answer = (searchData && searchData.answer) ? ('ملخص بحث: ' + searchData.answer + '\n\n') : '';
  const sys = 'أنت مساعد حكومي إماراتي خبير في المعاملات الرسمية (تجديد الإقامة، الرخص التجارية، التأمين، المخالفات، بطاقة الهوية، تأشيرات...). '
    + 'يُعطى إليك سؤال المستخدم ونتائج بحث حية من مصادر رسمية. '
    + 'اشرح خطوات إنجاز المعاملة بالترتيب + الرسوم التقريبية (بالدرهم) + الجهة المسؤولة + الرابط الرسمي. '
    + 'اعتمد على نتائج البحث الحية فقط للرسوم والروابط — ممنوع منعًا باتًا اختراع أي رابط أو رسم من ذاكرتك. '
    + 'إن لم تجد الرسم في نتائج البحث قل "الرسوم تختلف حسب الحالة — راجع الرابط الرسمي". '
    + 'اكتب بصيغة ماركداون منظمة (عناوين، خطوات مرقّمة، **غامق** للرسوم). أضف في النهاية سطر تنويه: "⚠️ الرسوم تقريبية وقد تتغير — الرابط الرسمي هو المرجع." '
    + 'اكتب '
    + (lang && /^ar/i.test(lang) ? 'بالعربية.' : ('باللغة: ' + (lang || 'ar') + '.'));
  const userMsg = 'سؤال المستخدم: ' + query + '\n\n' + answer + 'نتائج البحث الحية:\n' + (results || '(لا توجد نتائج — اعتذر واطلب من المستخدم زيارة الموقع الرسمي للجهة)');
  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 3000, system: sys, messages: [{ role: 'user', content: userMsg }] }),
  });
  let res = await doRequest(RESOLVED_MODEL || MODEL);
  let data = await res.json().catch(() => null);
  if (!res.ok && res.status === 404) { RESOLVED_MODEL = null; const m = await resolveModel(apiKey); res = await doRequest(m); data = await res.json().catch(() => null); }
  if (!res.ok) { const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status); const err = new Error(msg); err.status = res.status; throw err; }
  const md = (data && data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const sources = (searchData && Array.isArray(searchData.results) ? searchData.results : []).slice(0, 5).map((r) => ({ title: r.title || r.url, url: r.url }));
  return { answer: md, sources };
}
// ---------- 💼 مولّد السيرة الذاتية: CV احترافي + خطاب تقديم (HTML جاهز للطباعة PDF) ----------
async function callClaudeCV(apiKey, info, lang) {
  const isAr = !lang || /^ar/i.test(lang);
  const sys = 'أنت خبير توظيف ومصمم سير ذاتية محترف. تُعطى بيانات المستخدم كـ JSON. '
    + 'أنشئ سيرة ذاتية احترافية أنيقة + خطاب تقديم قصير. أعد فقط JSON صالحًا بلا نص خارجه وبلا أسوار كود بهذا الشكل:\n'
    + '{"cvHtml":"مستند HTML كامل ومستقل (inline CSS فقط) للسيرة الذاتية","coverLetter":"نص خطاب تقديم احترافي قصير (ماركداون)"}\n'
    + 'قواعد تصميم cvHtml: '
    + 'صفحة A4 نظيفة عصرية، هوامش مريحة، خط واضح (Segoe UI/Arial)، لون تمييز واحد أنيق (كحلي أو أخضر داكن) للعناوين والخط الفاصل. '
    + 'أقسام: الاسم + المسمى الوظيفي كترويسة، معلومات التواصل، نبذة مختصرة، الخبرات العملية (مع التواريخ والإنجازات)، التعليم، المهارات (وسوم/نقاط)، اللغات. '
    + 'إذا كانت اللغة عربية استخدم dir="rtl" وحاذِ يمينًا؛ ممنوع letter-spacing على النص العربي. '
    + 'ممنوع اختراع خبرات أو شهادات غير موجودة في البيانات — استخدم فقط ما زوّدك به المستخدم، ونسّقه بشكل احترافي. '
    + 'إن نقص قسم فتجاهله بدل اختراعه. اكتب المحتوى '
    + (isAr ? 'بالعربية.' : ('باللغة: ' + lang + '.'))
    + ' لا تكتب شيئًا خارج كائن JSON.';
  const doRequest = (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m, max_tokens: 8000, system: sys, messages: [{ role: 'user', content: 'بيانات المستخدم:\n' + JSON.stringify(info).slice(0, 12000) + '\n\nأنشئ السيرة الذاتية وخطاب التقديم وأعد JSON فقط.' }] }),
  });
  let res = await doRequest(RESOLVED_MODEL || MODEL);
  let data = await res.json().catch(() => null);
  if (!res.ok && res.status === 404) { RESOLVED_MODEL = null; const m = await resolveModel(apiKey); res = await doRequest(m); data = await res.json().catch(() => null); }
  if (!res.ok) { const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status); const err = new Error(msg); err.status = res.status; throw err; }
  const text = (data && data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return extractJSON(text);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const action = body.action || '';
    const username = body.token ? verifyToken(body.token) : null;
    const isOwner = !!username && String(username).trim().toLowerCase() === OWNER_USERNAME;

    // ---------------- process ----------------
    if (action === 'process') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }

      // Guests: cap N process calls per day per IP (owner + registered users pass).
      if (!username) {
        const ip = (typeof clientIp === 'function' && clientIp(req)) || 'unknown';
        const key = 'edu:proc:' + encodeURIComponent(ip) + ':' + todayStr();
        let count = 0;
        try { count = await kvIncr(key); if (count === 1) await kvExpire(key, 172800); } catch (e) { count = 0; }
        if (count > GUEST_PROCESS_PER_DAY) {
          res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + GUEST_PROCESS_PER_DAY + ' محاضرات). سجّل الدخول أو عد غدًا 🌙' });
          return;
        }
      }

      const { fileBase64, mime, text, images, lang } = body;
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
        result = await callClaude(apiKey, blocks, lang);
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

    // ---------------- 📄 document assistant (analyze) ----------------
    if (action === 'docqa') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      if (!username) {
        const ip = (typeof clientIp === 'function' && clientIp(req)) || 'unknown';
        const key = 'doc:proc:' + encodeURIComponent(ip) + ':' + todayStr();
        let count = 0;
        try { count = await kvIncr(key); if (count === 1) await kvExpire(key, 172800); } catch (e) { count = 0; }
        if (count > GUEST_PROCESS_PER_DAY) { res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + GUEST_PROCESS_PER_DAY + ' مستندات). سجّل الدخول أو عد غدًا 🌙' }); return; }
      }
      const { fileBase64, mime, text, images, lang } = body;
      let totalB64 = (fileBase64 || '').length;
      if (Array.isArray(images)) images.forEach((im) => { totalB64 += ((im && im.base64) || '').length; });
      if (totalB64 > MAX_BASE64_CHARS) { res.status(413).json({ error: 'حجم الملف كبير جدًا (الحد الأقصى ~10 ميغابايت). جرّب ملفًا أصغر.' }); return; }
      const blocks = [];
      if (fileBase64 && /pdf/i.test(mime || '')) blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } });
      else if (fileBase64 && /^image\//i.test(mime || '')) blocks.push({ type: 'image', source: { type: 'base64', media_type: mime, data: fileBase64 } });
      if (Array.isArray(images)) images.slice(0, 10).forEach((im) => { if (im && im.base64) blocks.push({ type: 'image', source: { type: 'base64', media_type: im.mime || 'image/jpeg', data: im.base64 } }); });
      if (text && String(text).trim()) blocks.push({ type: 'text', text: 'محتوى المستند:\n\n' + String(text).slice(0, 200000) });
      if (!blocks.length) { res.status(400).json({ error: 'لا يوجد مستند للتحليل — ارفع ملفًا أو الصق نصًا.' }); return; }
      blocks.push({ type: 'text', text: 'حلّل هذا المستند وأعد JSON فقط بالصيغة المطلوبة.' });
      let result = null;
      try { result = await callClaudeDoc(apiKey, blocks, lang); }
      catch (e) { res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر تحليل المستند: ' + (e.message || 'خطأ') + ' — حاول مرة أخرى.' }); return; }
      if (!result || !result.summary) { res.status(502).json({ error: 'تعذر فهم رد الذكاء الاصطناعي — حاول مرة أخرى.' }); return; }
      result.keypoints = Array.isArray(result.keypoints) ? result.keypoints.filter((k) => k && String(k).trim()) : [];
      result.fields = Array.isArray(result.fields) ? result.fields.filter((f) => f && f.label && f.value) : [];
      res.status(200).json({ ok: true, doc: result, guest: !username });
      return;
    }

    // ---------------- 📄 document assistant (follow-up question) ----------------
    if (action === 'docask') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      const { docText, question, history, lang } = body;
      if (!docText || !question) { res.status(400).json({ error: 'ناقص نص المستند أو السؤال.' }); return; }
      let answer = '';
      try { answer = await callClaudeDocAsk(apiKey, docText, question, history, lang); }
      catch (e) { res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر الرد: ' + (e.message || 'خطأ') + ' — حاول مرة أخرى.' }); return; }
      res.status(200).json({ ok: true, answer: answer || 'لم أجد إجابة في المستند.' });
      return;
    }

    // ---------------- 🧾 government transactions assistant ----------------
    if (action === 'gov') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      if (!username) {
        const ip = (typeof clientIp === 'function' && clientIp(req)) || 'unknown';
        const key = 'gov:proc:' + encodeURIComponent(ip) + ':' + todayStr();
        let count = 0;
        try { count = await kvIncr(key); if (count === 1) await kvExpire(key, 172800); } catch (e) { count = 0; }
        if (count > GUEST_PROCESS_PER_DAY) { res.status(402).json({ error: 'وصلت للحد اليومي المجاني. سجّل الدخول أو عد غدًا 🌙' }); return; }
      }
      const { query, lang } = body;
      if (!query || !String(query).trim()) { res.status(400).json({ error: 'اكتب سؤالك عن المعاملة.' }); return; }
      const q = String(query).trim().slice(0, 300);
      const searchData = await tavilySearchGov(q + ' الإمارات معاملة حكومية رسوم خطوات الموقع الرسمي');
      let out = null;
      try { out = await callClaudeGov(apiKey, q, searchData, lang); }
      catch (e) { res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر الرد: ' + (e.message || 'خطأ') + ' — حاول مرة أخرى.' }); return; }
      res.status(200).json({ ok: true, answer: out.answer, sources: out.sources, guest: !username });
      return;
    }

    // ---------------- 💼 CV generator ----------------
    if (action === 'cv') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' }); return; }
      if (!username) {
        const ip = (typeof clientIp === 'function' && clientIp(req)) || 'unknown';
        const key = 'cv:proc:' + encodeURIComponent(ip) + ':' + todayStr();
        let count = 0;
        try { count = await kvIncr(key); if (count === 1) await kvExpire(key, 172800); } catch (e) { count = 0; }
        if (count > GUEST_PROCESS_PER_DAY) { res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + GUEST_PROCESS_PER_DAY + ' سير ذاتية). سجّل الدخول أو عد غدًا 🌙' }); return; }
      }
      const { info, lang } = body;
      if (!info || typeof info !== 'object' || !(info.name || info.fullName)) { res.status(400).json({ error: 'عبّئ بياناتك أولًا (الاسم على الأقل).' }); return; }
      let result = null;
      try { result = await callClaudeCV(apiKey, info, lang); }
      catch (e) { res.status(e.status === 429 ? 429 : 502).json({ error: 'تعذر إنشاء السيرة: ' + (e.message || 'خطأ') + ' — حاول مرة أخرى.' }); return; }
      if (!result || !result.cvHtml) { res.status(502).json({ error: 'تعذر إنشاء السيرة — حاول مرة أخرى.' }); return; }
      res.status(200).json({ ok: true, cvHtml: result.cvHtml, coverLetter: result.coverLetter || '', guest: !username });
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
          quiz: Array.isArray(l.quiz) ? l.quiz.slice(0, 20) : [],
          createdAt: l.createdAt || Date.now(),
          bestScore: typeof l.bestScore === 'number' ? l.bestScore : null,
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
    res.status(500).json({ error: 'Edu error: ' + (e && e.message ? e.message : String(e)) });
  }
};
