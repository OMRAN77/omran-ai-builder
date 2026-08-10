'use strict';
/**
 * v545 — بنك المعرفة الجماعيّة (الوضع الآليّ).
 * أمر عمران المكتوب: «افتح باب المعرفة الجماعيّة — آليّ» (١٠ أغسطس ٢٠٢٦).
 *
 * الخطر الوحيد المعتبر هنا: تسرّب حقيقة شخصيّة من مستخدم إلى شاشة مستخدم آخر.
 * ضرر لا يُسترجع. لذلك ثلاث بوّابات متتالية لا بوّابة واحدة:
 *   ① فلتر النموذج    — يستخرج ما هو عامّ فقط، والرفض هو الأصل.
 *   ② فلتر ميكانيكيّ  — تعابير نمطيّة لا يقدر النموذج على تجاوزها مهما هلوس.
 *   ③ تأكيد مستقلّ    — لا تُنشر حقيقة حتّى يقترحها مستخدمان مختلفان.
 * البوّابة ③ هي الحارس الحقيقيّ: الحقيقة الشخصيّة لا يكرّرها غريب أبدًا.
 *
 * مفتاح الإطفاء الفوريّ بلا نشر: متغيّر البيئة KNOWLEDGE_DISABLED=1
 */

const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const KEY = 'db/knowledge/global.json';
const MAX_FACTS = 60;          // سقف البنك كلّه
const MAX_FACT_CHARS = 160;
const MIN_FACT_CHARS = 12;
const NEEDED_VOUCHES = 2;      // مستخدمان مختلفان قبل النشر للجميع
const BLOCK_CHARS = 700;       // سقف ما يُحقن في تعليمات النظام
const CACHE_MS = 5 * 60 * 1000;

function off() { return process.env.KNOWLEDGE_DISABLED === '1'; }

/* ————— أدوات ————— */

function norm(s) {
  return String(s || '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىئ]/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().toLowerCase();
}

// لا نخزّن اسم المستخدم أبدًا — بصمة قصيرة غير عكوسة فقط.
function whoHash(username) {
  const salt = process.env.AUTH_SECRET || 'k';
  return crypto.createHmac('sha256', salt).update('vouch:' + String(username || '')).digest('hex').slice(0, 8);
}

/* ————— ② الفلتر الميكانيكيّ ————— */

const REJECT = [
  /\d{5,}/,                                   // أرقام هواتف/لوحات/هويّات
  /[\w.+-]+@[\w-]+\.\w/,                      // بريد
  /https?:\/\//i,                             // روابط كاملة
  /\+?\d[\d\s-]{7,}/,                         // أرقام اتّصال مُنسَّقة
  /(^|\s)(أنا|انا|اسمي|اسمه|اسمها|عندي|لدي|زوجت|زوجي|ابني|ابنتي|بنتي|أخي|اخي|أختي|اختي|والدي|والدتي|أمي|امي|أبي|ابي|شركتي|مشروعي|رقمي|جوالي|هاتفي|بيتي|منزلي|عنواني|حسابي|راتبي|سيارتي)/,
  /(^|\s)(أنت|انت|أنتَ|إنك|انك|لك |عندك|رقمك|اسمك)/,
  /\b(i am|i'm|my name|my wife|my son|my daughter|my company|my number|mine)\b/i,
  /(المستخدم|هذا الشخص|صاحب الحساب|يقول المستخدم)/,
];

function mechanicalOk(text, username) {
  const t = String(text || '').trim();
  if (t.length < MIN_FACT_CHARS || t.length > MAX_FACT_CHARS) return false;
  if (/\n/.test(t)) return false;
  for (const re of REJECT) if (re.test(t)) return false;
  const u = String(username || '').trim();
  if (u.length > 2 && norm(t).includes(norm(u))) return false;   // لا يذكر صاحبه
  return true;
}

/* ————— التخزين ————— */

async function readBank() {
  try {
    const d = await kvGetJSON(KEY);
    if (d && Array.isArray(d.facts)) return d;
  } catch (e) { /* الصمت مقصود: البنك كماليّ، لا يُسقط طلبًا */ }
  return { facts: [] };
}

function evict(facts) {
  if (facts.length <= MAX_FACTS) return facts;
  // الأضعف تزكيةً ثمّ الأقدم يخرج أوّلًا
  return facts
    .slice()
    .sort((a, b) => ((b.v || []).length - (a.v || []).length) || (b.at - a.at))
    .slice(0, MAX_FACTS);
}

async function addFact(username, text) {
  const bank = await readBank();
  const k = norm(text);
  if (!k) return null;
  const who = whoHash(username);
  let f = bank.facts.find((x) => x && x.k === k);
  if (!f) {
    f = { k, t: String(text).trim(), v: [who], at: Date.now() };
    bank.facts.push(f);
  } else if ((f.v || []).includes(who)) {
    return null;                                   // لا يزكّي المرء نفسه مرّتين
  } else {
    f.v = (f.v || []).concat([who]).slice(-4);
    f.at = Date.now();
  }
  bank.facts = evict(bank.facts);
  bank.updatedAt = Date.now();
  await kvPutJSON(KEY, bank);
  return f;
}

/* ————— ① فلتر النموذج ————— */

const EXTRACT_SYS =
  'أنت مرشّح معرفة عامّة صارم. اقرأ مقتطف محادثة واستخرج حقائق عامّة ينتفع بها أي مستخدم آخر لا يعرف المتحدّث: ' +
  'خدمة أو إجراء رسميّ، سعر معلن، مصدر موثوق، تصحيح معلومة شائعة.\n' +
  'الرفض هو الأصل. ارفض قطعًا: أي شيء عن شخص بعينه، اسم، رقم، عنوان، مدينة سكن، عمل، أسرة، ' +
  'رأي شخصيّ، تفضيل، أو تفصيل لا ينفع غريبًا.\n' +
  'أخرج JSON فقط بلا أي شرح: {"facts":["..."]} — من صفر إلى حقيقتين، كلّ واحدة جملة عربيّة ' +
  'مستقلّة مفهومة وحدها، ≤١٤٠ حرفًا، بصيغة الغائب العامّة، بلا ضمير متكلّم أو مخاطب.\n' +
  'عند أدنى شكّ أخرج: {"facts":[]}';

function parseFacts(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const o = JSON.parse(m[0]);
    return Array.isArray(o.facts) ? o.facts.filter((x) => typeof x === 'string').slice(0, 2) : [];
  } catch (e) { return []; }
}

/**
 * يُنادى بعد نجاح دمج الذاكرة الشخصيّة. يفشل بصمت دائمًا — لا يُسقط ردًّا.
 */
async function learn(username, userText, aiText) {
  if (off() || !username) return;
  const snippet = ('مستخدم: ' + String(userText || '') + '\nالمساعد: ' + String(aiText || '')).slice(0, 1800);
  if (snippet.length < 40) return;
  let raw = null;
  try {
    raw = await require('./memory.js').callMergeModel(EXTRACT_SYS, snippet);
  } catch (e) { return; }
  if (!raw) return;
  for (const fact of parseFacts(raw)) {
    const t = String(fact).trim();
    if (!mechanicalOk(t, username)) continue;
    try { await addFact(username, t); } catch (e) { /* صمت */ }
  }
}

/* ————— الحقن ————— */

function render(bank) {
  const pub = (bank.facts || [])
    .filter((f) => f && f.t && (f.v || []).length >= NEEDED_VOUCHES)
    .sort((a, b) => ((b.v || []).length - (a.v || []).length) || (b.at - a.at));
  let out = '';
  for (const f of pub) {
    const line = '\n- ' + f.t;
    if (out.length + line.length > BLOCK_CHARS) break;
    out += line;
  }
  if (!out) return '';
  return '\n\n[معرفة عامّة تراكمت من استعمال التطبيق — استعملها إن كانت ذات صلة فقط، ' +
    'ولا تعلن مصدرها، وإن عارضتها معلومة أوثق فقدّم الأوثق]:' + out;
}

let _cache = { txt: '', at: 0, busy: false };

/** نسخة متزامنة للمسارات غير المتزامنة (الدردشة النصّيّة): تعيد المخبّأ وتُحدّثه في الخلفيّة. */
function block() {
  if (off()) return '';
  if (!_cache.busy && Date.now() - _cache.at > CACHE_MS) {
    _cache.busy = true;
    readBank()
      .then((b) => { _cache = { txt: render(b), at: Date.now(), busy: false }; })
      .catch(() => { _cache.busy = false; _cache.at = Date.now(); });
  }
  return _cache.txt;
}

/** نسخة غير متزامنة للمسارات التي تنتظر أصلًا (الوكيل): طازجة دائمًا. */
async function blockAsync() {
  if (off()) return '';
  try {
    const b = await readBank();
    _cache = { txt: render(b), at: Date.now(), busy: false };
    return _cache.txt;
  } catch (e) { return _cache.txt || ''; }
}

module.exports = { learn, block, blockAsync, readBank, addFact, mechanicalOk, norm, NEEDED_VOUCHES };
