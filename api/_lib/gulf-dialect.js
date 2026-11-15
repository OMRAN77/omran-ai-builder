'use strict';
/* api/_lib/gulf-dialect.js — v-gulf-lexicon (المالك ١٥ نوفمبر: «تزويد المعلومات باللهجة الإماراتيّة والخليجيّة من ا إلى ي… أيّ شخص يسأل
   الذكاء أيّ سؤال يقدر يجاوب عليه — مثال: ما معنى كلمة روشن؟ التطبيق: تعني واضح أو مضيء… هذا الجواب خطأ»).
   الجذر: النموذج يخمّن معنى الكلمة الخليجيّة من الفارسيّة أو من تشابه الحروف (روشن الفارسيّة = مضيء)، وفي الخليج الروشن كوّة/رفّ في جدار البيت.
   الحلّ: قاموس خليجيّ (gulf-lexicon.json: الكلمة وصيغها، المعنى بالفصحى والإنجليزيّة، الدول، مثال، قديمة/دارجة/جديدة) يُقرأ حين يسأل المستخدم
   عن معنى كلمة، فيصل مدخلها إلى ذيل الدور مرجعًا يجيب منه النموذج؛ وإن لم تكن فيه فتنبيه يمنع التخمين ويطلب البحث في معناها باللهجة.
   لا شبكة ولا أسرار، والقاموس يُحمَّل كسولًا عند أوّل سؤال معنى (الإقلاع البارد لا يتأثّر). */

const COUNTRY = { ae: 'الإمارات', sa: 'السعوديّة', kw: 'الكويت', qa: 'قطر', bh: 'البحرين', om: 'عُمان' };
const ERA = { old: 'قديمة (تراثيّة)', common: 'دارجة', new: 'جديدة' };

/** توحيد الكتابة للمطابقة: بلا تشكيل ولا تطويل، والهمزات والتاء المربوطة والألف المقصورة موحّدة. */
function norm(s) {
  return String(s || '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[«»"'“”‘’()[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
/* الحروف الخليجيّة يكتبها الناس بأكثر من شكل: باچر/باجر/باكر، گال/قال، ڤ/ف. يُفهرس كلّ شكل. */
const SWAP = [[/چ/g, ['چ', 'ج', 'ك']], [/گ/g, ['گ', 'ق', 'ك']], [/ڤ/g, ['ڤ', 'ف']]];
function forms(s) {
  let out = [norm(s)];
  for (const [re, subs] of SWAP) {
    const next = [];
    for (const f of out) { if (re.test(f)) { for (const x of subs) next.push(f.replace(re, x)); } else next.push(f); re.lastIndex = 0; }
    out = next;
  }
  const withAl = [];
  for (const f of out) { withAl.push(f); if (/^ال\S{2,}/.test(f)) withAl.push(f.slice(2)); }
  return Array.from(new Set(withAl.filter(Boolean)));
}

let LEX = null, INDEX = null;
/** القاموس وفهرسه — كسول، ويقبل بديلًا للاختبار. */
function load(data) {
  if (data) { LEX = data; INDEX = null; }
  if (!LEX) LEX = require('./gulf-lexicon.json');
  if (!INDEX) {
    INDEX = new Map();
    LEX.forEach((e, i) => {
      for (const k of [e.w].concat(e.alt || [], e.pl ? [e.pl] : [])) {
        for (const f of forms(k)) { const arr = INDEX.get(f) || []; if (!arr.includes(i)) arr.push(i); INDEX.set(f, arr); }
      }
    });
  }
  return { LEX, INDEX };
}

/** مداخل الكلمة أو العبارة (بـ«ال» أو بدونها، وبأيّ شكل لـچ/گ/ڤ). */
function lookup(word) {
  const { LEX: L, INDEX: I } = load();
  const seen = new Set(), out = [];
  const fs = forms(word);
  for (const f of fs) {
    for (const i of (I.get(f) || [])) if (!seen.has(i)) { seen.add(i); out.push(L[i]); }
  }
  // الكلمة نفسها مدخلًا أوّلًا (روشن قبل روشان التي تذكرها صيغةً)، ثمّ الإماراتيّ
  const rank = (e) => (forms(e.w).some((f) => fs.includes(f)) ? 0 : 2) + ((e.c || []).includes('ae') ? 0 : 1);
  return out.map((e, i) => [e, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map((x) => x[0]);
}

const Q = '(?:ما|شو|وش|ويش|ايش|إيش|اش|شنو|شنهو|شنهي|عن)';
const MEAN = '(?:معنى|معنا|معني|مدلول|تفسير)';
const KAL = '(?:كلم[ةه]|لفظ[ةه]|مصطلح|عبار[ةه]|مفرد[ةه])';
const W = '[\\u0621-\\u064A\\u0671-\\u06D3\\u06A4\\u06AF\\u0686\\u064B-\\u065F\\u0640]+';
const YA = '(?:يعني|تعني|معناها|معناه|معناته)';
const SPAN = '(' + W + '(?:\\s+' + W + '){0,4})';
const ASK_RES = [
  // ما معنى (كلمة) X · شو معنى X · معنى كلمة X
  new RegExp('(?:^|[\\s،,.!؟?])(?:' + Q + '\\s+)?' + MEAN + '\\s+(?:' + KAL + '\\s+)?[«"\'“]?' + SPAN, 'u'),
  // شو يعني X · وش تعني كلمة X
  new RegExp('(?:^|[\\s،,.!؟?])' + Q + '\\s+(?:يعني|تعني|معناها|معناه)\\s+(?:' + KAL + '\\s+)?[«"\'“]?' + SPAN, 'u'),
  // X يعني شو · كلمة X وش معناها · X شو معناه
  new RegExp('(?:^|[\\s،,.!؟?])(?:' + KAL + '\\s+)?[«"\'“]?' + SPAN + '[»"\'”]?\\s+(?:' + YA + '\\s*' + Q + '|' + Q + '\\s+' + YA + ')\\s*[؟?!.]*\\s*$', 'u'),
];
const TRAILING = 2; // رقم النمط الذي تأتي فيه الكلمة قبل السؤال: تؤخذ من آخر المقطع لا من أوّله
const EN_RE = /\b(?:what\s+does|what's|what\s+is)\s+(?:the\s+(?:word|meaning\s+of)\s+)?["“']?([\u0621-\u064A\u0686\u06AF\u06A4\s]{2,40}?)["”']?\s+(?:mean|meaning)\b|\bmeaning\s+of\s+["“']?([\u0621-\u064A\u0686\u06AF\u06A4\s]{2,40})/i;
/* ما يلحق السؤال ولا هو من الكلمة: «بالإماراتي»، «في اللهجة الخليجيّة»، «عندكم»… (المقارنة بعد norm) */
const TAIL = new Set(['بالإماراتي', 'بالخليجي', 'باللهجة', 'بلهجة', 'في', 'عند', 'عندكم', 'عندنا', 'اللهجة', 'الإماراتية', 'الخليجية', 'بالعامي',
  'بالعامية', 'العامية', 'يعني', 'تعني', 'معناها', 'معناه', 'شو', 'وش', 'إيش', 'ايش', 'شنو', 'ما', 'هي', 'هو', 'لو', 'سمحت', 'تكفى', 'بالسعودي',
  'بالكويتي', 'بالقطري', 'بالبحريني', 'بالعماني', 'و', 'أو', 'اللي', 'الي', 'يقولون', 'نقول', 'تقال'].map(norm));
const STOP_START = new Set(['هذي', 'هذا', 'هذه', 'الكلمة', 'كلمة', 'هالكلمة', 'هاللفظة', 'هالعبارة', 'لفظة', 'عبارة'].map(norm));
const clean = (s) => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[«»"'“”‘’]/g, ' ').trim();

/** الكلمات المسؤول عن معناها في النصّ كما كتبها المستخدم (حتّى ثلاث)، أو [] إن لم يكن سؤال معنى. */
function askedWords(text) { return ask(text).words; }
/* «وش يعني أسوّي الحين؟» سؤال قصد لا سؤال معنى: تنبيه «ابحث عن معناها» لا يُعطى إلّا لسؤال صريح (معنى/كلمة/mean) أو رسالة قصيرة. */
function ask(text) {
  const t = String(text || '').slice(0, 400), none = { words: [], strong: false };
  if (!/معن|يعني|تعني|مدلول|تفسير|mean/i.test(t)) return none;
  let span = '', trailing = false, idx = -1;
  for (let i = 0; i < ASK_RES.length; i++) { const m = ASK_RES[i].exec(t); if (m && m[1]) { span = m[1]; trailing = i === TRAILING; idx = i; break; } }
  if (!span) { const m = EN_RE.exec(t); if (m) { span = (m[1] || m[2] || '').trim(); idx = 9; } }
  if (!span) return none;
  const strong = idx === 0 || idx === 9 || new RegExp(KAL, 'u').test(t) || (clean(t).split(/\s+/).length <= 4 && clean(span).split(/\s+/).length === 1);
  return { words: pick(span, trailing), strong };
}
function pick(span, trailing) {
  let toks = clean(span).split(/\s+/).filter(Boolean);
  const isTail = (x) => TAIL.has(norm(x)), found = (x) => lookup(x).length > 0;
  if (trailing) { // «يا خوي روشن يعني شو»: العبارة الأطول من آخر المقطع، وإلّا الكلمة الأخيرة
    for (let n = Math.min(3, toks.length); n >= 1; n--) {
      const ph = toks.slice(-n).join(' ');
      if (n === 1 || found(ph)) return (ph.length >= 2 && !isTail(ph) && !STOP_START.has(norm(ph))) ? [ph] : [];
    }
  }
  while (toks.length && STOP_START.has(norm(toks[0]))) toks.shift();
  const cut = toks.findIndex(isTail);
  if (cut === 0) return [];
  if (cut > 0) toks = toks.slice(0, cut);
  toks = toks.slice(0, 5);
  if (!toks.length) return [];
  // العبارة الأطول الموجودة في القاموس أوّلًا (على هونك)، ثمّ الكلمات المنفردة المعطوفة («ياهل وروشن»).
  const out = [];
  for (let n = Math.min(3, toks.length); n >= 2; n--) {
    const ph = toks.slice(0, n).join(' ');
    if (found(ph)) { out.push(ph); toks = toks.slice(n); break; }
  }
  if (!out.length) out.push(toks.shift());
  for (const x of toks) {
    if (out.length >= 3) break;
    const y = found(x) ? x : x.replace(/^و(?=\S{3,})/, '');
    if (found(y) && !out.includes(y)) out.push(y);
  }
  return out.filter((x) => x && x.length >= 2);
}

function entryLine(e) {
  const c = (e.c || []).map((k) => COUNTRY[k]).filter(Boolean).join('، ');
  return '• «' + e.w + '»' + ((e.alt && e.alt.length) ? ' (وتُقال: ' + e.alt.slice(0, 4).join('، ') + ')' : '') + (e.pl ? ' — الجمع: ' + e.pl : '')
    + (e.pos ? ' [' + e.pos + ']' : '') + ': ' + e.ar + (e.en ? ' — EN: ' + e.en : '')
    + (c ? ' · تُستعمل في: ' + c : '') + (ERA[e.era] ? ' · ' + ERA[e.era] : '')
    + (e.ex ? ' · مثال: «' + e.ex + '»' : '') + (e.note ? ' · ملاحظة: ' + e.note : '');
}

/** ملاحظة ذيل الدور: مداخل القاموس للكلمة المسؤول عنها، أو تنبيه بلا تخمين إن لم تكن فيه؛ '' إن لم يكن سؤال معنى. */
function turnNote(text) {
  let words, strong;
  try { ({ words, strong } = ask(text)); } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/gulf-dialect:ask'); return ''; }
  if (!words.length) return '';
  if (!strong) words = words.slice(0, 1); // «وش يعني أسوّي الحين؟»: لا تُلتقط «الحين» من ذيل جملة ليست سؤال معنى
  const found = [], missing = [];
  for (const w of words) { const es = lookup(w).slice(0, 3); if (es.length) found.push([w, es]); else missing.push(w); }
  const parts = [];
  if (found.length) {
    parts.push('[قاموس اللهجة الخليجيّة — مرجع هذا الدور]: سأل المستخدم عن معنى ' + found.map(([w]) => '«' + w + '»').join(' و') + '. هذا معناها في اللهجة:\n'
      + found.map(([, es]) => es.map(entryLine).join('\n')).join('\n')
      + '\nأجب من هذا المدخل بلهجة المستخدم وبإيجاز (المعنى، ومثال، وأين تُقال إن أفاد)، ولا تخمّن معنًى من الفارسيّة أو الفصحى أو تشابه الحروف، ولا حاجة للبحث. '
      + 'إن كان للكلمة معنى آخر خارج اللهجة (فصحى، اسم مشروع أو علم) فاذكره بعد المعنى الخليجيّ لا قبله، ولا تذكر هذا القاموس ولا هذه الملاحظة.');
  }
  if (missing.length && strong) {
    parts.push('[سؤال عن معنى كلمة]: ' + missing.map((w) => '«' + w + '»').join(' و') + ' قد تكون من لهجة خليجيّة أو عامّيّة. إن لم تكن فصحى واضحة فابحث عن معناها في اللهجة '
      + '(مثل: معنى ' + missing[0] + ' في اللهجة الإماراتية والخليجية) قبل أن تجيب، ولا تخمّن من الفارسيّة أو من تشابه الحروف؛ وإن لم تجد مصدرًا واضحًا فقل إنّك لست متأكّدًا ولا تختلق معنى.');
  }
  return parts.join('\n');
}

module.exports = { norm, forms, load, lookup, ask, askedWords, turnNote, entryLine, COUNTRY };
