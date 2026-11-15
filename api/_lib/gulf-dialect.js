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

/** مداخل القاموس للكلمة المسؤول عنها، أو تنبيه بلا تخمين إن لم تكن فيه؛ '' إن لم يكن سؤال معنى. */
function wordNote(text) {
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

/* ── الأمثال الشعبيّة (v-gulf-proverbs — المالك ١٥ نوفمبر: «الأمثال القديمة كلها… أبي الناس تعرفها»): gulf-proverbs.json كسول.
   ١) «شو معنى مثل إذا طاح الجمل…» أو المثل نفسه مع سؤال معنى ← مدخله (المعنى، ومتى يُقال)؛ تكفي أوّل ثلاث كلمات منه.
   ٢) «عطني أمثال عن الصبر / مثل شعبي عن الجار» ← حتّى ثمانية أمثال موضوعها فيها، فلا يخترع النموذج أمثالًا. */
let PROV = null, PKEYS = null;
function loadProverbs(data) {
  if (data) { PROV = data; PKEYS = null; }
  if (!PROV) PROV = require('./gulf-proverbs.json');
  if (!PKEYS) {
    const strip = (x) => norm(x).replace(/[^ء-يچگڤ ]/g, ' ').replace(/\s+/g, ' ').trim();
    PKEYS = PROV.map((e) => [e.p].concat(e.alt || []).map(strip).filter((k) => k.split(' ').length >= 2));
  }
  return { PROV, PKEYS };
}
const pstrip = (x) => norm(x).replace(/[^ء-يچگڤ ]/g, ' ').replace(/\s+/g, ' ').trim();
/** الأمثال المذكورة في النصّ: الكاملة وحدها إن وُجدت، وإلّا ما طابق أوّله ثلاث كلمات فأكثر (الأطول تطابقًا أوّلًا). */
function proverbsIn(text) {
  const t = ' ' + pstrip(String(text || '').slice(0, 500)) + ' ';
  const { PROV: P, PKEYS: K } = loadProverbs(), hits = [];
  K.forEach((keys, i) => {
    let best = 0;
    for (const k of keys) {
      const w = k.split(' ');
      if (t.includes(' ' + k + ' ')) { best = Math.max(best, 100 + w.length); continue; }
      for (let n = w.length - 1; n >= 3; n--) if (t.includes(' ' + w.slice(0, n).join(' ') + ' ')) { best = Math.max(best, n); break; }
    }
    if (best) hits.push([best, P[i]]);
  });
  if (!hits.length) return [];
  const top = Math.max.apply(null, hits.map((h) => h[0]));
  return hits.filter((h) => h[0] === top || (top < 100 && h[0] >= top - 1)).map((h) => h[1]).slice(0, 3);
}
const TOPIC_RE = /(?:امثال|أمثال|الامثال|الأمثال|مثل|مثال)\s+(?:شعبي[ةه]?\s+|شعبيّ[ةه]?\s+|قديم[ةه]?\s+|خليجي[ةه]?\s+|اماراتي[ةه]?\s+|إماراتيّ?[ةه]?\s+){0,3}(?:عن|على|في|تخص|تخصّ|حول)\s+([ء-ي]{2,})/;
/** أمثال موضوعها الكلمة المطلوبة («عن الصبر» ← كلمة من جذرها في المثل أوّلًا، ثمّ في معناه أو متى يُقال) — كلمةً لا جزء كلمة. */
function proverbsAbout(text) {
  const m = TOPIC_RE.exec(String(text || '').slice(0, 300));
  if (!m) return { topic: '', list: [] };
  const topic = m[1], k = norm(topic).replace(/^ال(?=\S{2,})/, '');
  const stem = k.length > 3 ? k.replace(/[هي]$/, '') : k;
  const toks = (x) => pstrip(x).split(' ').map((w) => w.replace(/^(?:وال|بال|فال|كال|لل|ال|و|ب|ف|ل)(?=\S{2,})/, ''));
  const hit = (x) => toks(x).some((w) => w.startsWith(stem) && w.length <= stem.length + 2);
  const { PROV: P } = loadProverbs();
  const inP = P.filter((e) => hit(e.p)), inM = P.filter((e) => !inP.includes(e) && (hit(e.ar) || hit(e.use || '')));
  return { topic, list: inP.concat(inM).slice(0, 8) };
}
function proverbLine(e) {
  const c = (e.c || []).map((k) => COUNTRY[k]).filter(Boolean).join('، ');
  return '• «' + e.p + '»' + ((e.alt && e.alt.length) ? ' (ويُقال: ' + e.alt.slice(0, 2).join('؛ ') + ')' : '') + ': ' + e.ar + (e.en ? ' — EN: ' + e.en : '')
    + (e.use ? ' · متى يُقال: ' + e.use : '') + (c ? ' · معروف في: ' + c : '');
}
function proverbNote(text) {
  const t = String(text || '');
  const asksMeaning = /معن|يعني|تعني|يقصد|قصده|قصدهم|مقصود|شرح|اشرح|mean/i.test(t);
  if (asksMeaning || /مثل|المثل|يقولون|قالوا/.test(t)) {
    const hits = proverbsIn(t);
    if (hits.length && (asksMeaning || /المثل|مثل يقول|يقولون|قالوا/.test(t))) {
      return '[الأمثال الشعبيّة الخليجيّة — مرجع هذا الدور]: ذكر المستخدم هذا المثل؛ هذا معناه:\n' + hits.map(proverbLine).join('\n')
        + '\nاشرح المثل من هذا المدخل بلهجة المستخدم وبإيجاز (المعنى، ومتى يُقال، ومثال من الحياة إن أفاد)، ولا تخمّن معنًى آخر، ولا تذكر هذا المرجع ولا هذه الملاحظة.';
    }
  }
  const ab = proverbsAbout(t);
  if (ab.list.length) {
    return '[الأمثال الشعبيّة الخليجيّة — مرجع هذا الدور]: طلب المستخدم أمثالًا عن «' + ab.topic + '». هذه أمثال خليجيّة حقيقيّة بمعانيها:\n' + ab.list.map(proverbLine).join('\n')
      + '\nاختر منها ما يناسب واشرح كلّ مثل بسطر، ولا تخترع أمثالًا ليست مأثورة، ولا تذكر هذا المرجع ولا هذه الملاحظة.';
  }
  return '';
}

/** ملاحظة ذيل الدور: المثل المذكور أو أمثال الموضوع أوّلًا، وإلّا معنى الكلمة؛ '' لغير ذلك. */
function turnNote(text) {
  let p = '';
  try { p = proverbNote(text); } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/gulf-dialect:proverb'); }
  return p || wordNote(text);
}

module.exports = { norm, forms, load, lookup, ask, askedWords, turnNote, wordNote, entryLine, COUNTRY, loadProverbs, proverbsIn, proverbsAbout, proverbNote };
