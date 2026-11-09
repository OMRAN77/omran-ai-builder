'use strict';
/* v-owner-inbox (أمر المالك ٢٠ أكتوبر: «اريد كلام المستخدمين يكون الخطاء يحول عندي ولا فيه شتيمه ولا متضايق من التطبيق كيف اعرف» ← «نعم ابدا»):
   صندوق المالك. حارس على كلام غير المالك في المحادثة والوكيل — بقائمة كلمات بلا موديل ولا كلفة: شتيمة (insult)، أو تذمّر من
   التطبيق (complaint: عبارة قويّة وحدها، أو عبارة ضعيفة مع ذكر التطبيق/المساعد/«انت»)، أو فشل ردّ أمامه (error: حدث error من الخادم).
   يُحفظ البلاغ وحده — الاسم والوقت والمزوّد والنوع ومقطع ≤٢٠٠ حرف — لا المحادثة (المالك وافق صراحةً على قراءة المقاطع). يصل المالك
   Push فورًا (مرّة لكلّ مستخدم ونوع في الساعة)، ويظهر في لوحته («📥 صندوق المالك» في نافذة رأيك يهمنا)، وإيميل يوميّ مجمّع مع
   جرد البريد (email-sweep). المالك نفسه لا يُبلَّغ عن كلامه. لا مفتاح يُقرأ في نطاق الوحدة.
   v-owner-problems (المالك ٩ نوفمبر: «واحد من المستخدمين يقول سويت فيديو وماحصلته… اريد كل المشاكل الي في التطبيق توصلي على الايميل»):
   - نوع رابع tool = أداة فشلت أمام مستخدم: فيديو مدفوع فشل عند المزوّد أو لم يُسلَّم (video-job.settleVideoJob)، وأيّ ردّ خطأ خادم
     (5xx) أو رفض بدء فيديو من موجّهات api لمستخدم غير المالك (_errors.withErrorCapture). يُحفظ بالأداة والطلب والسبب.
   - كلّ بلاغ يدفع Push يصل المالك إيميلًا فوريًّا أيضًا (الحارس نفسه: مرّة لكلّ مستخدم ونوع في الساعة)، بسقف يوميّ OWNER_MAIL_DAY_CAP
     (الافتراضيّ ٢٠، و٠ يطفئه) — Resend المجّانيّ ١٠٠ رسالة في اليوم ومنها رموز دخول المستخدمين. ما فوق السقف في الإيميل اليوميّ.
   - الإيميل اليوميّ يضمّ أخطاء الخادم الجديدة منذ آخر إرسال (سجلّ _errors.js) ولو بلا بلاغ. */
const LIST_KEY = 'db/owner-inbox/list.json';
const DIGEST_KEY = 'db/owner-inbox/digest.json';
const PUSH_KEY = 'db/owner-inbox/push/';
const MAX_ITEMS = 300;
const EXCERPT = 200;
const SCAN_MAX = 4000;
const PUSH_TTL_S = 3600;
const DEDUPE_MS = 10 * 60 * 1000;
const DETAIL = 300;               // v-owner-problems: سبب فشل الأداة (رفض الرقابة، رصيد المزوّد…) يصل كاملًا تقريبًا
const MAIL_DAY_KEY = 'db/owner-inbox/mail-day/';
const MAIL_DAY_CAP_DEFAULT = 20;  // v-owner-problems: إيميلات فوريّة في اليوم (توقيت الإمارات) — الباقي في الإيميل اليوميّ
const SERVER_LOG_KEY = 'db/server-errors/log.json'; // سجلّ _errors.js (لا يُستورد: ذلك الملفّ يحمّل kv عند التحميل)
const SERVER_MAX = 40;

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
/* v-inbox-own-words (لقطة المالك ٥ نوفمبر: مواصفات تطبيق GameTracker ملصوقة من luki صارت «متضايق من التطبيق»): العميل (app-09) يحوّل
   اللصق فوق ١٠٠٠ حرف والملفّات النصّيّة إلى مرفق يُلحق بعد كلام المستخدم «📄 الاسم:\n```…```» — مادّة (كود، مواصفات، سجلّ) لا كلامه،
   وفيها «errors/crash/slow» مع «the app» دائمًا. المصنّف يقرأ ما قبل أوّل مرفق وحده. ليس استثناء «طلب صنع» (PITFALLS): ما يكتبه
   المستخدم بنفسه يُقرأ كلّه كما كان. */
const ATTACH_HEAD = /(?:^|\n\n)📄 [^\n]{1,200}:\n```/;
function ownWords(text) {
  const s = String(text || '');
  const m = ATTACH_HEAD.exec(s);
  return m ? s.slice(0, m.index) : s;
}
function classify(text) {
  const s = ownWords(text).slice(0, SCAN_MAX);
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
  const via = entry.via === 'agent' || entry.via === 'tool' ? entry.via : 'chat';
  const item = { id: 'R' + now.toString(36) + Math.random().toString(36).slice(2, 5), at: now, user, prov: String(entry.prov || '').slice(0, 40), via, kind: entry.kind, text: excerpt(entry.text) };
  if (entry.detail) item.detail = excerpt(entry.detail, DETAIL);
  const items = await readList(kv);
  const key = normKey(item.text);
  if (items.some((x) => x && x.user === user && x.kind === item.kind && now - (Number(x.at) || 0) < DEDUPE_MS && normKey(x.text) === key)) return { saved: false, reason: 'dup', item: null };
  items.push(item);
  await kv.kvPutJSON(LIST_KEY, { items: items.slice(-MAX_ITEMS) });
  let pushed = false, mailed = 'skip', fresh = false;
  try {
    fresh = await kv.kvSetIfAbsent(PUSH_KEY + encodeURIComponent(user.toLowerCase()) + ':' + item.kind, String(now), PUSH_TTL_S);
    if (fresh) {
      const push = o.push || require('./_owner-alert.js').pushToOwners;
      await push({ title: PUSH_TITLE[item.kind] || PUSH_TITLE.error, body: user + ' · ' + (item.prov || '-') + ': ' + item.text.slice(0, 120) + (item.detail ? ' — ' + item.detail.slice(0, 60) : ''), url: '/' }, o.pushOpts);
      pushed = true;
    }
  } catch (e) { try { require('./log-error.js').logError('owner-inbox:push', e); } catch (e2) { typeof require === 'function' && require('./_swallow.js').swallow(e2, '_lib/owner-inbox:89'); /* guard-ok — فشل الإشعار لا يمنع الحفظ */ } }
  /* v-owner-problems: البلاغ نفسه إيميلًا فوريًّا بالحارس نفسه (مرّة لكلّ مستخدم ونوع في الساعة). بعد الردّ (waitUntil) فلا يؤخّر دور
     المحادثة الذي ينتظر scanTurn؛ والاختبار يحقن sendMail فينتظره. */
  if (fresh) {
    const job = mailNow(item, o).catch((e) => { try { require('./log-error.js').logError('owner-inbox:mail', e); } catch (e2) { typeof require === 'function' && require('./_swallow.js').swallow(e2, '_lib/owner-inbox:mail'); /* guard-ok — الإيميل تحسين */ } return 'error'; });
    mailed = (!o.sendMail && later(job)) ? 'background' : await job;
  }
  return { saved: true, pushed, mailed, item };
}
const PUSH_TITLE = { insult: '🤬 شتيمة من مستخدم', complaint: '😠 مستخدم متضايق من التطبيق', error: '⚠️ فشل ردّ أمام مستخدم', tool: '🧰 أداة فشلت أمام مستخدم' };

/** waitUntil المنصّة إن وُجد (الوعد يكمل بعد الردّ)؛ وإلّا false فينتظره المستدعي. */
function later(job) {
  try {
    const w = _seam.waitUntil || require('./signup-notify.js').platformWaitUntil();
    if (w) { w(job); return true; }
  } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/owner-inbox:later'); /* guard-ok — بلا سياق طلب يُنتظر الوعد */ }
  return false;
}
const _seam = { waitUntil: null }; // للاختبارات وحدها

function mailCap(env) {
  const raw = String(env.OWNER_MAIL_DAY_CAP == null ? '' : env.OWNER_MAIL_DAY_CAP).trim();
  const n = Number(raw);
  return raw === '' || !Number.isFinite(n) ? MAIL_DAY_CAP_DEFAULT : Math.max(0, Math.floor(n));
}
function uaeDay(ms) { return new Date(ms + 4 * 3600000).toISOString().slice(0, 10); }

/** v-owner-problems: إيميل فوريّ ببلاغ واحد — بسقف يوميّ (OWNER_MAIL_DAY_CAP). يرجع sent · failed · capped · off. */
async function mailNow(item, o) {
  const env = o.env || process.env;
  const to = String(env.OWNER_NOTIFY_EMAIL || '').trim();
  if (!to || !env.RESEND_API_KEY) return 'off';
  const cap = mailCap(env);
  if (!cap) return 'off';
  const kv = o.kv || require('./kv.js');
  const dk = MAIL_DAY_KEY + uaeDay(Number(item.at) || Date.now());
  const n = Number(await kv.kvIncr(dk)) || 0;
  if (n === 1) await kv.kvExpire(dk, 2 * 86400);
  if (n > cap) return 'capped';
  const auth = require('./auth.js');
  const esc = (s) => auth.escapeHtml(String(s == null ? '' : s));
  const label = KIND_LABEL[item.kind] || item.kind;
  const rows = [
    ['الوقت (الإمارات)', uaeTime(item.at)],
    ['المستخدم', item.user],
    ['النوع', label],
    [item.kind === 'tool' ? 'الأداة' : 'المزوّد', item.prov || '-'],
    [item.kind === 'tool' ? 'الطلب' : 'كلامه', item.text],
  ];
  if (item.detail) rows.push([item.kind === 'tool' ? 'السبب' : 'الخطأ', item.detail]);
  const html = '<div dir="rtl" style="font-family:sans-serif;max-width:620px;margin:0 auto;font-size:14px">'
    + '<h2 style="margin:0 0 10px">' + esc(PUSH_TITLE[item.kind] || label) + '</h2>'
    + '<table style="border-collapse:collapse;width:100%">'
    + rows.map(([k, v]) => '<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd;color:#666;white-space:nowrap;vertical-align:top">' + esc(k)
      + '</td><td style="padding:6px 10px;border-bottom:1px solid #ddd"><div dir="auto" style="white-space:pre-wrap;word-break:break-word">' + esc(v) + '</div></td></tr>').join('')
    + '</table><p style="color:#888;font-size:12px;margin:12px 0 0">إيميل فوريّ ' + n + ' من ' + cap + ' اليوم — البلاغات كلّها في «📥 صندوق المالك» وفي الإيميل اليوميّ.</p></div>';
  const subject = ('⚠️ ' + label + ' — ' + item.user + (item.prov ? ' · ' + item.prov : '')).replace(/[\r\n]+/g, ' ').slice(0, 120);
  const send = o.sendMail || auth.sendMail;
  return (await send(to, subject, html)) ? 'sent' : 'failed';
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
/** v-owner-problems: أداة فشلت أمام مستخدم غير المالك (فيديو لم يصل، خطأ خادم في أداة). args: { user, tool, text, detail }. لا يرمي. */
async function noteTool(args, opts) {
  const a = args || {};
  try {
    const user = String(a.user || '').trim();
    if (!user || isOwnerUser(user)) return { kind: null };
    const r = await record({ user, prov: a.tool, via: 'tool', kind: 'tool', text: a.text || a.tool || '(أداة)', detail: a.detail }, opts);
    return Object.assign({ kind: 'tool' }, r);
  } catch (e) {
    try { require('./log-error.js').logError('owner-inbox:tool', e); } catch (e2) { typeof require === 'function' && require('./_swallow.js').swallow(e2, '_lib/owner-inbox:tool'); /* guard-ok — البلاغ تحسين */ }
    return { kind: 'tool', saved: false };
  }
}
/** نفسه بعد الردّ (waitUntil) — من مسارات لا يجوز أن ينتظر ردّها البلاغ (استطلاع الفيديو، ردّ خطأ الموجّه). */
function noteToolLater(args, opts) {
  const job = noteTool(args, opts);
  later(job);
  return job;
}
const KIND_LABEL = { insult: 'شتيمة', complaint: 'متضايق من التطبيق', error: 'فشل ردّ أمامه', tool: 'فشل أداة أمامه' };
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
  const errs = await newServerErrors(kv, since, now); // v-owner-problems: أخطاء الخادم الجديدة منذ آخر إيميل
  if (!items.length && !errs.length) return { sent: false, reason: 'empty' };
  const auth = require('./auth.js');
  const esc = (s) => auth.escapeHtml(String(s == null ? '' : s));
  const counts = items.reduce((m, x) => { m[x.kind] = (m[x.kind] || 0) + 1; return m; }, {});
  const html = '<div dir="rtl" style="font-family:sans-serif;max-width:640px;margin:0 auto">'
    + '<h2 style="margin:0 0 8px">صندوق المالك — ' + items.length + ' بلاغًا جديدًا</h2>'
    + '<p style="margin:0 0 12px;color:#666">' + Object.keys(counts).map((k) => esc(KIND_LABEL[k] || k) + ': ' + counts[k]).join(' · ') + (errs.length ? (items.length ? ' · ' : '') + 'أخطاء خادم جديدة: ' + errs.length : '') + '</p>'
    + (items.length ? '<table style="border-collapse:collapse;width:100%;font-size:14px">'
    + items.slice().reverse().map((x) => '<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap;color:#666">' + esc(uaeTime(x.at)) + '</td>'
      + '<td style="padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap"><b>' + esc(x.user) + '</b><br><span style="color:#888">' + esc(x.prov || '') + '</span></td>'
      + '<td style="padding:6px 8px;border-bottom:1px solid #ddd;white-space:nowrap">' + esc(KIND_LABEL[x.kind] || x.kind) + '</td>'
      + '<td style="padding:6px 8px;border-bottom:1px solid #ddd"><div dir="auto">' + esc(x.text) + '</div>' + (x.detail ? '<br><span style="color:#a33">' + esc(x.detail) + '</span>' : '') + '</td></tr>').join('')
    + '</table>' : '')
    + (errs.length ? '<h3 style="margin:18px 0 6px">أخطاء الخادم الجديدة (' + errs.length + ')</h3>'
      + '<table style="border-collapse:collapse;width:100%;font-size:13px">'
      + errs.map((x) => '<tr><td style="padding:5px 8px;border-bottom:1px solid #eee;white-space:nowrap;color:#666">' + esc(uaeTime(Date.parse(x.lastAt || x.at) || 0)) + '</td>'
        + '<td style="padding:5px 8px;border-bottom:1px solid #eee;white-space:nowrap"><b dir="ltr">' + esc(String(x.route || '') + (x.action ? '?' + x.action : '')) + '</b>' + ((Number(x.count) || 1) > 1 ? '<br><span style="color:#888">×' + esc(x.count) + '</span>' : '') + '</td>'
        + '<td style="padding:5px 8px;border-bottom:1px solid #eee;color:#a33"><div dir="auto" style="word-break:break-word">' + esc(String(x.message || '').slice(0, 300)) + '</div></td></tr>').join('')
      + '</table>' : '')
    + '</div>';
  const subject = items.length ? 'صندوق المالك: ' + items.length + ' بلاغًا جديدًا من المستخدمين' + (errs.length ? ' · أخطاء خادم: ' + errs.length : '') : 'صندوق المالك: أخطاء خادم جديدة: ' + errs.length;
  const send = o.sendMail || auth.sendMail;
  const ok = await send(to, subject.slice(0, 120), html);
  if (ok) await kv.kvPutJSON(DIGEST_KEY, { sentAt: now, count: items.length, errors: errs.length });
  return { sent: !!ok, count: items.length, errors: errs.length };
}
/** v-owner-problems: أخطاء سجلّ الخادم التي وقعت (أو تكرّرت) بعد آخر إيميل — الأحدث أوّلًا، حتّى SERVER_MAX. */
async function newServerErrors(kv, since, now) {
  try {
    const list = await kv.kvGetJSON(SERVER_LOG_KEY);
    return (Array.isArray(list) ? list : []).filter((x) => {
      const t = Date.parse((x && (x.lastAt || x.at)) || '') || 0;
      return t > since && t <= now;
    }).slice(0, SERVER_MAX);
  } catch (e) { return []; } // guard-ok — السجلّ تحسين: بلاغات المستخدمين تُرسل بدونه
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
Object.assign(module.exports, { classify, ownWords, excerpt, scanTurn, noteFailure, noteTool, noteToolLater, record, mailNow, mailCap, dailyDigest, readList, KIND_LABEL, LIST_KEY, DIGEST_KEY, MAIL_DAY_KEY, MAIL_DAY_CAP_DEFAULT, SERVER_LOG_KEY, MAX_ITEMS, EXCERPT, DETAIL, PUSH_TTL_S, DEDUPE_MS, _seam });
