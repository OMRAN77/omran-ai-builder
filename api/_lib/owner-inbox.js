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
/** نوع البلاغ لكلام المستخدم: 'insult' · 'complaint' · null. الشتيمة أوّلًا. */
function classify(text) {
  const s = String(text || '').slice(0, SCAN_MAX);
  if (!s.trim()) return null;
  if (INSULT_AR.test(s) || OBSCENE_AR.test(s) || INSULT_EN.test(s) || OBSCENE_EN.test(s)) return 'insult';
  if (STRONG_AR.test(s) || STRONG_EN.test(s)) return 'complaint';
  if ((WEAK_AR.test(s) || WEAK_EN.test(s)) && SUBJECT.test(s)) return 'complaint';
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
