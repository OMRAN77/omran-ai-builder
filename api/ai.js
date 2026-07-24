// Router: consolidates the 9 AI provider proxy functions into a single
// Vercel Serverless Function to stay under the Hobby plan's function limit.
// Old public paths (e.g. /api/openai) are preserved via vercel.json rewrites
// that append ?action=<name>. Requires use literal paths so Vercel's file
// tracer (@vercel/nft) includes each module in the deployment bundle.
function load(action) {
  switch (action) {
    case 'openai': return require('./_lib/openai.js');
    case 'gemini': return require('./_lib/gemini.js');
    case 'groq': return require('./_lib/groq.js');
    case 'claude': return require('./_lib/claude.js');
    case 'cohere': return require('./_lib/cohere.js');
    case 'deepseek': return require('./_lib/deepseek.js');
    case 'mistral': return require('./_lib/mistral.js');
    case 'openrouter': return require('./_lib/openrouter.js');
    case 'perplexity': return require('./_lib/perplexity.js');
    case 'agent': return require('./_lib/agent.js');
    default: return null;
  }
}

// --- Server-side real date/time injection (UAE) + topic-follow rule ---
function serverNote() {
  const now = new Date();
  const opts = { timeZone: 'Asia/Dubai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
  let ar = '', en = '';
  try { ar = new Intl.DateTimeFormat('ar-AE', opts).format(now); } catch (e) {}
  try { en = new Intl.DateTimeFormat('en-GB', opts).format(now); } catch (e) {}
  return '\n\n[حقيقة مؤكدة من الخادم — التاريخ والوقت الفعلي الآن بتوقيت الإمارات (Asia/Dubai)]: ' + ar + ' — ' + en +
    '. هذا هو التاريخ الصحيح الوحيد. إذا سُئلت عن اليوم أو التاريخ أو السنة أو الوقت فأجب بهذا التاريخ حرفياً، وتجاهل تماماً أي تاريخ من بيانات تدريبك.' +
    '\n[قاعدة متابعة الموضوع — مطلقة]: آخر رسالة من المستخدم هي مهمتك الوحيدة الآن. إذا غيّر الموضوع فاتبع الموضوع الجديد فوراً وأسقط كل المواضيع السابقة نهائياً — ممنوع خلط أي موضوع قديم بالإجابة إلا إذا رجع له المستخدم بنفسه. المحادثة السابقة خلفية فقط.' +
    '\n[قاعدة الأسماء — مطلقة]: أسماء الأشخاص التي تظهر داخل التصاميم أو الشهادات أو الطلبات (مثل اسم صاحب شهادة أو بطاقة) ليست اسم المستخدم. ممنوع مخاطبة المستخدم بأي اسم شخصي إلا إذا عرّف عن نفسه بنفسه صراحةً.';
}

// Appended to the LAST user message itself — models weight this far more
// heavily than system text, which is what actually stops topic bleeding.
const LAST_MSG_NOTE = '\n\n[تعليمات من النظام — إلزامية: أجب على هذه الرسالة الأخيرة وموضوعها الحالي فقط. ممنوع منعاً باتاً إكمال أو خلط أي موضوع سابق من المحادثة (لعبة، صورة، تصميم، كود سابق...) إلا إذا طلبته هذه الرسالة نفسها صراحةً. ممنوع الرد بعبارات عامة مثل "شو تبي تعمل؟" أو "هل تريد تعديلات؟" — أجب على السؤال نفسه إجابة كاملة. وممنوع منعاً باتاً مناداة المستخدم بأي اسم شخصي — أي اسم يظهر في التصميم أو الشهادة أو البطاقة هو محتوى للتصميم فقط وليس اسم المستخدم.]';
const LAST_MSG_PREFIX = '[السؤال الحالي الوحيد المطلوب الإجابة عليه الآن — تجاهل كل المواضيع السابقة]:\n';

function tagLastUserMessage(action, body) {
  if (action === 'gemini') {
    if (!Array.isArray(body.contents)) return;
    for (let i = body.contents.length - 1; i >= 0; i--) {
      const c = body.contents[i];
      if (c && c.role === 'user' && Array.isArray(c.parts)) {
        for (let j = c.parts.length - 1; j >= 0; j--) {
          if (typeof c.parts[j].text === 'string') { c.parts[j].text = LAST_MSG_PREFIX + c.parts[j].text + LAST_MSG_NOTE; return; }
        }
        return;
      }
    }
    return;
  }
  if (!Array.isArray(body.messages)) return;
  for (let i = body.messages.length - 1; i >= 0; i--) {
    const m = body.messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') { m.content = LAST_MSG_PREFIX + m.content + LAST_MSG_NOTE; return; }
    if (Array.isArray(m.content)) {
      for (let j = m.content.length - 1; j >= 0; j--) {
        if (m.content[j] && m.content[j].type === 'text' && typeof m.content[j].text === 'string') { m.content[j].text = LAST_MSG_PREFIX + m.content[j].text + LAST_MSG_NOTE; return; }
      }
    }
    return;
  }
}

function injectNote(action, body) {
  const note = serverNote();
  tagLastUserMessage(action, body);
  if (action === 'gemini') {
    const si = body.systemInstruction;
    if (typeof si === 'string') body.systemInstruction = si + note;
    else if (si && Array.isArray(si.parts) && si.parts.length && typeof si.parts[0].text === 'string') si.parts[0].text += note;
    else body.systemInstruction = { parts: [{ text: note.trim() }] };
  } else if (action === 'claude') {
    body.system = (typeof body.system === 'string' ? body.system : '') + note;
  } else if (Array.isArray(body.messages)) {
    const sys = body.messages.find(function (m) { return m && m.role === 'system' && typeof m.content === 'string'; });
    if (sys) sys.content += note;
    else body.messages.unshift({ role: 'system', content: note.trim() });
  }
}

const PROVIDERS = ['openai', 'gemini', 'groq', 'claude', 'cohere', 'deepseek', 'mistral', 'openrouter', 'perplexity'];

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown ai route: ' + action });
    return;
  }
  if (PROVIDERS.indexOf(action) !== -1 && req.method === 'POST') {
    try {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
      if (b && typeof b === 'object') { injectNote(action, b); req.body = b; }
    } catch (e) { /* never block the request over the note */ }
  }
  return handler(req, res);
};
