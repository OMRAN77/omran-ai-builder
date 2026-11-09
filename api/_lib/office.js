'use strict';
/* api/_lib/office.js — v-office-files (طلب المالك ٧ نوفمبر: «اطلب منه جدول حضور وانصراف من الاكسل وهو يجهّزلي كل شي… فقط انا اطبع»
   ثمّ «في المحادثة… المجّاني مرّة وحدة… التعديل يحتاج اشتراك… مرّة وحدة بالشهر»): ملفّ Excel أو PowerPoint حقيقيّ من داخل المحادثة.

   • الأداة create_office_file: النموذج يكتب «المحتوى» (أعمدة، صفوف، شرائح، أرقام) بمخطّط دلاليّ مضبوط، والعميل
     (js/app-44-office.js) يبني الملفّ في المتصفّح بتصميم ثابت قويّ (ألوان، حدود، معادلات، قوائم منسدلة، إعداد طباعة A4،
     يمين-يسار) — فقوّة الملفّ لا تتعلّق بأيّ نموذج أجاب. الخادم لا يبني ملفًّا ولا يحفظه: ينظّف المخطّط ويقصّه ويبثّه كرتًا.
   • الحصّة (قرار المالك): المشترك بباقة سارية والمالك وVIP بلا حدّ (المحادثة نفسها تُعدّ في سلّتها كالعادة). المجّانيّ
     ملفّ واحد في الشهر (شهر UTC) — وأيّ ملفّ بعده، تعديلًا كان أو جديدًا، كرت اشتراك. الضيف كرت تسجيل.
   • المسار المجّانيّ للمحادثة بلا أدوات (السلسلة المجّانيّة)؛ فدور «طلب ملفّ» لمجّانيّ بقيت حصّته يُخدم وحده على المسار
     المدفوع بأداة الملفّ وحدها (chat.js) — وبعد نفاد الحصّة لا نموذج أصلًا: ردّ ثابت وكرت الاشتراك.
   • العدّ ذرّيّ (INCR) لحظة نجاح الأداة لا قبلها؛ ما تجاوز السقف يُردّ (DECR). عطل KV = مفتوح كبقيّة الحصص. */

const FREE_MONTHLY = 1;
const MONTH_TTL_SEC = 40 * 86400;
const THEMES = ['teal', 'navy', 'green', 'purple', 'orange', 'red', 'gray', 'gold'];
const COL_TYPES = ['text', 'index', 'number', 'currency', 'percent', 'date', 'time', 'hours', 'choice', 'check', 'signature', 'formula'];
const COLORS = ['green', 'red', 'amber', 'blue', 'gray', 'purple'];
const OPS = ['sum', 'avg', 'count', 'min', 'max'];
const LAYOUTS = ['title', 'section', 'bullets', 'table', 'imageText', 'stats', 'chart', 'twoColumn', 'timeline', 'quote', 'closing'];
const CHARTS = ['bar', 'column', 'line', 'pie', 'doughnut'];
const ICONS = ['users', 'chart', 'calendar', 'clock', 'check', 'star', 'idea', 'target', 'money', 'book', 'school', 'building', 'heart', 'shield', 'rocket', 'globe', 'phone', 'mail', 'cart', 'trophy', 'gear', 'leaf', 'flag', 'image'];
const RTL_LANGS = ['ar', 'ur', 'fa', 'he'];
const LANGS = ['ar', 'en', 'ur', 'hi', 'bn', 'fil', 'id', 'ml', 'ne', 'zh', 'es', 'fr', 'ru', 'tr', 'fa'];
const MAX = { sheets: 6, cols: 30, rows: 200, blank: 200, totalRows: 300, slides: 20, bullets: 8, tRows: 12, tCols: 8, stats: 4, series: 4, labels: 12, steps: 6, choices: 8, fields: 6, sigs: 4, hl: 6 };

/* ── تنظيف ── */
function str(v, n) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  return s.length > n ? s.slice(0, n) : s;
}
function oneOf(v, list, def) { const s = String(v == null ? '' : v).trim(); return list.indexOf(s) !== -1 ? s : def; }
function int(v, lo, hi, def) { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }
function arr(v, n) { return Array.isArray(v) ? v.slice(0, n) : []; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function cell(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v ? '✓' : '';
  return str(v, 200);
}
// اسم ملفّ آمن: حروف أيّ لغة وأرقام وشرطة وشرطة سفليّة ومسافة — بلا امتداد ولا مسار.
function fileName(v, fallback) {
  const s = String(v == null ? '' : v).replace(/\.(xlsx|pptx|xls|ppt|pdf)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s || fallback;
}
function sheetName(v, i) {
  const s = String(v == null ? '' : v).replace(/[\[\]:*?\/\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
  return s || ('Sheet' + (i + 1));
}
/* المعادلة: {c3} = خليّة العمود ٣ في الصفّ نفسه، و{r} = رقم الصفّ. ممنوع ما يصل خارج الملفّ (روابط وملفّات خارجيّة
   وماكرو) — أيّ معادلة فيها شيء من ذلك تُسقط والعمود يبقى نصًّا فارغًا. */
const FORMULA_BAD = /(https?:|\[|\]|!|\bHYPERLINK\b|\bWEBSERVICE\b|\bFILTERXML\b|\bRTD\b|\bDDE\b|\bCALL\b|\bREGISTER\b|\bINDIRECT\b|\bEXEC\b|\bcmd\b|\|)/i;
function formula(v) {
  let s = str(v, 240);
  if (!s) return '';
  if (s[0] !== '=') s = '=' + s;
  if (FORMULA_BAD.test(s)) return '';
  if (!/^=[\w\s{}()+\-*/^&<>=,.;:"%؀-ۿ٠-٩$]*$/.test(s)) return '';
  return s;
}
function month(v) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(v || '').trim());
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return '';
  return y + '-' + String(mo).padStart(2, '0');
}

function cleanColumn(c) {
  const o = c && typeof c === 'object' ? c : { header: c };
  const type = oneOf(o.type, COL_TYPES, 'text');
  const col = { header: str(o.header, 40) || '—', type };
  const w = int(o.width, 3, 60, 0); if (w) col.width = w;
  if (type === 'choice') { const ch = arr(o.choices, MAX.choices).map((x) => str(x, 14)).filter(Boolean); if (ch.length) col.choices = ch; else col.type = 'text'; }
  if (type === 'formula' || o.formula) { const f = formula(o.formula); if (f) { col.formula = f; col.type = 'formula'; } else if (type === 'formula') col.type = 'text'; }
  if (o.format && (type === 'number' || type === 'formula')) col.format = oneOf(o.format, ['number', 'currency', 'percent', 'hours', 'decimal'], undefined);
  if (!col.format) delete col.format;
  if (o.currency) col.currency = str(o.currency, 6);
  return col;
}

function cleanSheet(s, i) {
  const o = s && typeof s === 'object' ? s : {};
  const columns = arr(o.columns, MAX.cols).map(cleanColumn);
  const sh = { name: sheetName(o.name || o.title, i), title: str(o.title, 120), subtitle: str(o.subtitle, 200), columns };
  const width = Math.max(columns.length, 1);
  sh.rows = arr(o.rows, MAX.rows).map((r) => arr(r, width).map(cell));
  sh.blankRows = int(o.blankRows, 0, MAX.blank, 0);
  if (sh.rows.length + sh.blankRows > MAX.totalRows) sh.blankRows = Math.max(0, MAX.totalRows - sh.rows.length);
  const fields = arr(o.fields, MAX.fields).map((x) => str(x, 40)).filter(Boolean); if (fields.length) sh.fields = fields;
  const sigs = arr(o.signatures, MAX.sigs).map((x) => str(x, 40)).filter(Boolean); if (sigs.length) sh.signatures = sigs;
  const note = str(o.note, 300); if (note) sh.note = note;
  if (o.orientation) sh.orientation = oneOf(o.orientation, ['portrait', 'landscape'], undefined);
  if (!sh.orientation) delete sh.orientation;
  if (o.days && typeof o.days === 'object') {
    const m = month(o.days.month);
    if (m) {
      const d = { month: m };
      const wk = arr(o.days.weekend, 3).map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6); /* خارج الأسبوع يسقط لا يُقصّ إلى السبت */ d.weekend = wk.length ? Array.from(new Set(wk)) : [5, 6];
      const ch = arr(o.days.choices, MAX.choices).map((x) => str(x, 6)).filter(Boolean); if (ch.length) d.choices = ch;
      const lg = arr(o.days.legend, MAX.choices).map((x) => str(x, 24)); if (ch.length && lg.some(Boolean)) d.legend = lg.slice(0, ch.length);
      sh.days = d;
    }
  }
  if (o.totals && typeof o.totals === 'object' && o.totals.ops && typeof o.totals.ops === 'object') {
    const ops = {};
    Object.keys(o.totals.ops).slice(0, MAX.cols).forEach((k) => { const ci = int(k, 1, width, 0); const op = oneOf(o.totals.ops[k], OPS, ''); if (ci && op) ops[ci] = op; });
    if (Object.keys(ops).length) sh.totals = { label: str(o.totals.label, 30), ops };
  }
  const hl = arr(o.highlight, MAX.hl).map((h) => (h && typeof h === 'object' ? { value: str(h.value, 14), color: oneOf(h.color, COLORS, '') } : null)).filter((h) => h && h.value && h.color);
  if (hl.length) sh.highlight = hl;
  return sh;
}

function cleanTable(t) {
  const o = t && typeof t === 'object' ? t : {};
  const headers = arr(o.headers, MAX.tCols).map((x) => str(x, 40));
  const w = Math.max(headers.length, 1);
  const rows = arr(o.rows, MAX.tRows).map((r) => arr(r, w).map((x) => (typeof x === 'number' ? x : str(x, 80))));
  return headers.length ? { headers, rows } : null;
}
function cleanSlide(s) {
  const o = s && typeof s === 'object' ? s : {};
  const sl = { layout: oneOf(o.layout, LAYOUTS, 'bullets'), title: str(o.title, 100) };
  const sub = str(o.subtitle, 200); if (sub) sl.subtitle = sub;
  const bullets = arr(o.bullets, MAX.bullets).map((x) => str(x, 160)).filter(Boolean); if (bullets.length) sl.bullets = bullets;
  const tb = cleanTable(o.table); if (tb) sl.table = tb;
  const stats = arr(o.stats, MAX.stats).map((x) => (x && typeof x === 'object' ? { value: str(x.value, 12), label: str(x.label, 40) } : null)).filter((x) => x && x.value); if (stats.length) sl.stats = stats;
  if (o.chart && typeof o.chart === 'object') {
    const labels = arr(o.chart.labels, MAX.labels).map((x) => str(x, 24));
    const series = arr(o.chart.series, MAX.series).map((x) => (x && typeof x === 'object' ? { name: str(x.name, 30), values: arr(x.values, labels.length).map((v) => num(v) == null ? 0 : num(v)) } : null)).filter((x) => x && x.values.length);
    if (labels.length && series.length) sl.chart = { type: oneOf(o.chart.type, CHARTS, 'column'), labels, series };
  }
  ['left', 'right'].forEach((k) => {
    const c = o[k];
    if (c && typeof c === 'object') { const b = arr(c.bullets, 6).map((x) => str(x, 140)).filter(Boolean); const h = str(c.heading, 60); if (h || b.length) sl[k] = { heading: h, bullets: b }; }
  });
  const steps = arr(o.steps, MAX.steps).map((x) => (x && typeof x === 'object' ? { title: str(x.title, 40), text: str(x.text, 120) } : null)).filter((x) => x && (x.title || x.text)); if (steps.length) sl.steps = steps;
  const q = str(o.quote, 240); if (q) sl.quote = q;
  const au = str(o.author, 60); if (au) sl.author = au;
  const ic = oneOf(o.icon, ICONS, ''); if (ic) sl.icon = ic;
  const cap = str(o.imageCaption, 80); if (cap) sl.imageCaption = cap;
  const notes = str(o.notes, 600); if (notes) sl.notes = notes;
  return sl;
}

/** المخطّط بعد التنظيف، أو { error } بسبب يُعاد للنموذج. */
function sanitizeSpec(input) {
  const o = input && typeof input === 'object' ? input : {};
  const kind = oneOf(String(o.kind || o.type || '').toLowerCase().replace(/^\./, ''), ['xlsx', 'pptx'], '');
  if (!kind) return { error: 'kind يجب أن يكون xlsx أو pptx' };
  const lang = oneOf(String(o.lang || '').toLowerCase().slice(0, 3), LANGS, '') || (/[؀-ۿ]/.test(String(o.title || '')) ? 'ar' : 'en');
  const spec = { v: 1, kind, title: str(o.title, 120), lang, rtl: RTL_LANGS.indexOf(lang) !== -1, theme: oneOf(o.theme, THEMES, 'teal') };
  spec.fileName = fileName(o.fileName || o.title, kind === 'xlsx' ? 'omran-sheet' : 'omran-slides');
  if (kind === 'xlsx') {
    spec.sheets = arr(o.sheets, MAX.sheets).map(cleanSheet).filter((s) => s.columns.length || s.days);
    if (!spec.sheets.length) return { error: 'لا ورقة فيها أعمدة — أرسل sheets[].columns' };
    const seen = {};
    spec.sheets.forEach((s, i) => { let n = s.name; let k = 2; while (seen[n.toLowerCase()]) n = s.name.slice(0, 28) + ' ' + (k++); seen[n.toLowerCase()] = 1; s.name = n; if (!s.title) s.title = i === 0 ? spec.title : s.name; });
  } else {
    spec.slides = arr(o.slides, MAX.slides).map(cleanSlide).filter((s) => s.title || s.bullets || s.table || s.stats || s.chart || s.steps || s.quote);
    if (!spec.slides.length) return { error: 'لا شرائح — أرسل slides[]' };
  }
  if (!spec.title) spec.title = spec.fileName;
  return { spec };
}

/* ── النيّة ── ما يكتبه المستخدم بكلامه وحده (المرفق الملصوق يصل ذيلًا «📄 الاسم:\n```…```» — PITFALLS) */
function ownWords(text) {
  /* v-office-image: والعميل يُلحق «[مرفقات: اسم.jpg]» بنصّ دور الصورة — «جدول الحضور.jpg» أو «presentation.png» ليسا طلب ملفّ */
  let s = String(text || '').slice(0, 4000).replace(require('./owner-carry.js').ATTACH_NOTE_RE, ''); // القصّ قبل التعبير: \n* في أوّله تربيعيّ على سطور جديدة طويلة (٨٠ ألفًا = ٥ ث لكلّ مستخدم) — والناتج نفسه (أوّل ١٢٠٠ حرف)
  const cut = s.search(/\n\n📄|```/);
  if (cut !== -1) s = s.slice(0, cut);
  return s.slice(0, 1200);
}
/* v-office-spell (رسالة المالك ٨ نوفمبر «سولي راجعه بي  الباور بويت» — جاءه سؤال «قصدك…؟» بلا ملفّ): كتابة الناس لا القاموس.
   «باور/بور/بوور/بوير» + فاصل اختياريّ + «بوينت/بويت/بونت/بوانت» (ونطق «ط»)، وأخطاء power point الإنجليزيّة، و«برزنتيشن»، و«إيكسل/exel».
   تُركت عمدًا (تقيس إيجابيّات كاذبة): بوين/بون بلا «ت» (بوربون، بوينغ)، بوت، بنت؛ أكسل/الأكسل/أكسيل/ايكسل (أكسل = أكثر كسلًا، Axel)؛ xls.
   v-office-explicit: exel كلمةً كاملة (exelent ليست ملفًّا)، و«شيت» بحدّ يسار عربيّ (مشيت/تمشيت ليستا شيت — حصّة المجّانيّ كانت تُصرف عليهما). */
const FILE_RE = /(excel|\bexel\b|إكسل|اكسل|اكسيل|إكسيل|الاكسل|الإكسل|إيكسي?ل|ايكسيل|xlsx|spreadsheet|(?<![\u0600-\u06FF])(?:ال|بال|لل|ب|و|ف)?شيت|po?we?r?[\s\-]?p(?:oi?nt|iont|oit|oin\b)|با?و{1,2}ي?ر[\s\-ـ]*بو{1,2}(?:ي{0,2}ن[تط]|ي[تط]|ان[تط])|بر[يى]?[زس][يى]?نت[يى]?ش[يى]?ن|pptx|\bppt\b|عرض\s*تقديم|عرض\s*بور|عرض\s*باور|شرائح|سلايدات|سلايد|slides?\b|presentation|slide\s?deck)/i;
const DOMAIN_RE = /(جدول|كشف|سجل|سجلّ|نموذج|ملف|ملفّ|timesheet|roster|tracker)[\s\S]{0,24}(حضور|حظور|انصراف|دوام|غياب|درجات|علامات|مناوب|ورديات|رواتب|معاشات|مصاريف|مصروفات|ميزاني|مخزون|جرد|مبيعات|حصص|دراسي|طلاب|موظفين|عملاء|فواتير|أقساط|اقساط|مهام|attendance|grades|salar|inventory|expenses|budget|schedule|shifts)/i;
const MAKE_RE = /(^|[\s،,.!؟?«"'(])(سو|سوّ|سوي|سوّي|سويلي|سوّيلي|سولي|سوّلي|اعمل|إعمل|اعملي|اصنع|جهز|جهّز|جهزلي|جهّزلي|حضّر|حضر|انشئ|أنشئ|انشأ|صمم|صمّم|ابي|أبي|ابغى|أبغى|ابغي|أبغي|اريد|أريد|ودي|بغيت|عطني|أعطني|اعطني|ارسل|أرسل|طلع|طلّع|make|create|build|generate|prepare|design|need|want|give\s+me|i'?d\s+like|can\s+you\s+(make|create|do))(?=$|[\s،,.!؟?»"')]|لي|ني)/i;
const HOWTO_RE = /(^|[\s،,.!؟?«"'])(كيف|شلون|طريقة|شرح|اشرح|ليش|لماذا|ما\s*هي|ماهي|وش\s*الفرق|how\s+(to|do|can\s+i)|what\s+is|explain|why)(?=$|[\s،,.!؟?»"'])/i;
const FOR_ME_RE = /(سو\s*لي|سوّ\s*لي|سوي\s*لي|سوّي\s*لي|اعمل\s*لي|جهز\s*لي|جهّز\s*لي|حضر\s*لي|make\s+me|create\s+me|for\s+me)/i;
/* ── v-office-explicit (مراجعة v-office-image، ٨ نوفمبر): طلب الملفّ «الصريح» = الفعل مفعوله الملفّ، لا كلمة الملفّ في أيّ مكان ──
   كلمة Excel/PowerPoint وحدها سرقت تعديلات صور حقيقيّة («شيل الخلفية عشان احطها في البوربوينت»، «صمم بوستر لدورة اكسل»)،
   و«ابي» مع لقطة صارت ملفًّا إجباريًّا لسؤال («ابي رايك في البوربوينت حقي»، «ابي زر اكسل هنا»). الصريح واحد من ثلاثة:
   (أ) فعل صنع أو «سوّ لي» أو «ابي/عطني» مفعوله الملفّ مباشرة («سوّ لي اكسل»، «ابي ملف اكسل من هذي الصورة»، «ابي هذا الجدول بالاكسل»)؛
   (ب) فعل صنع والملفّ صيغته («سولي راجعه بي  الباور بويت»، «make a summary in excel»)؛ (ج) تحويل إلى ملفّ («حوّل هذا الجدول إلى اكسل»).
   وليس صريحًا: مفعول الفعل صورة أو تصميم أو زرّ («صمّم بوستر…»، «make this logo transparent…»، «سوي زر بوربوينت هنا»)، ولا الملصقات.
   نسخة العميل (js/app-09-attach.js: OMRAN_OFFICE_*) حرفيّة — اختبار office-files ٢١ يطابق المصادر. بلا lookbehind (سفاري قبل 16.4). */
const B_ = '(?:^|[\\s،,.!؟?«»"\'()])';
const FILE_W = '(?:excel|exel\\b|xlsx|spreadsheets?|po?we?r?[\\s\\-]?p(?:oi?nt|iont|oit|oin\\b)|pptx?\\b|presentation|slides?\\b|slide\\s?deck'
  + '|إكسل|اكسل|اكسيل|إكسيل|إيكسي?ل|ايكسيل|شيت|با?و{1,2}ي?ر[\\s\\-ـ]*بو{1,2}(?:ي{0,2}ن[تط]|ي[تط]|ان[تط])|بر[يى]?[زس][يى]?نت[يى]?ش[يى]?ن|عرض\\s*تقديمي|سلايدات|سلايد)'; // بلا «شرائح» المجرّدة: شرائح زين/بيانات/لحم
const EN_FILE = '(?:excel|exel\\b|xlsx|spreadsheets?|po?we?r?[\\s\\-]?p(?:oi?nt|iont|oit|oin\\b)|pptx?\\b|presentation|slides?\\b|slide\\s?deck)';
const CREATE_V = '(?:سو|سوّ|سوي|سوّي|سويلي|سوّيلي|سولي|سوّلي|اعمل|إعمل|اعملي|اصنع|جهز|جهّز|جهزلي|جهّزلي|حضّر|حضر|انشئ|أنشئ|انشأ|صمم|صمّم|make|create|build|generate|prepare|design|can\\s+you\\s+(?:make|create|do))';
const FORME_V = '(?:[تي]?(?:سو|سوّ|سوي|سوّي)\\s*لي|[تي]?(?:عمل|اعمل)\\s*لي|[تي]?(?:جهز|جهّز|حضر|حضّر)\\s*لي|make\\s+me|create\\s+me)';
const WANT_V = '(?:ابي|أبي|ابغى|أبغى|ابغي|أبغي|اريد|أريد|ودي|بغيت|عطني|أعطني|اعطني|ارسل\\s*لي|أرسل\\s*لي|need|want|give\\s+me|send\\s+me|i\'?d\\s+like)';
const FILL = '(?:لي|ني|ملف|ملفّ|ملفات|عرض|جدول|ورق[ةه]|كشف|نموذج|احلى|أحلى|افضل|أفضل|احسن|أحسن|حلو|حلو[ةه]|زين|جديد|جديد[ةه]|مرتّ?ب|مرتّ?ب[ةه]|بسيط|كامل|واحد|وحد[ةه]|شريح[ةه]|شرائح|me|us|an?|one|nice|good|great|cool|clean|simple|quick|new|full|short|small|detailed|professional|\\d+(?:-\\w+)?|[٠-٩]+)';
const DEM_AR = '(?:\\s*(?:لي|ني))?\\s+(?:نفس\\s+)?(?:(?:هذا|هذي|هذه|هال\\S+|ال(?:جدول|بيانات|[اأ]سماء|[اأ]رقام|قائم[ةه]|درجات|حضور|معلومات|ملاحظات|نتائج|كشف|محتوى|نص|كلام|مراجع[ةه]|شرح|ملخص|درس|فصل|وحد[ةه])\\S*)\\s+){1,2}(?:بال|ب|في|على|كـ|ك|لل|ل|إلى|الى)?\\s*(?:ملفّ?\\s+)?' + FILE_W;
const DEM_EN = '\\s+(?:this|that|these|those|it|them|the|my)\\b(?:\\s+\\S+){0,2}?\\s+(?:in|as|into|to)\\s+(?:(?:an?|the)\\s+)?' + EN_FILE;
const OBJ = (v) => B_ + v + '(?:\\s*(?:لي|ني))?(?:\\s+' + FILL + '){0,3}\\s*(?:بال|ب|ال)?(?:' + FILE_W + '|' + DOMAIN_RE.source + ')' + '|' + B_ + v + '(?:' + DEM_AR + '|' + DEM_EN + ')';
const ANY_V = '(?:' + FORME_V + '|' + CREATE_V + '|' + WANT_V + ')', MAKE_V = '(?:' + FORME_V + '|' + CREATE_V + ')';
const OBJ_RE = new RegExp(OBJ(ANY_V), 'i');
const OBJ_OWNER_RE = new RegExp(OBJ(MAKE_V), 'i'); // المالك: «ابي/ودي» مع لقطته كلام عن واجهة التطبيق غالبًا («ابي شيت هنا بدال الجدول») — فعل الصنع وحده
const MED_RE = new RegExp(B_ + MAKE_V + '[\\s\\S]{0,80}?(?:' + B_ + '(?:(?:بي|بـ|في|فى|على|كـ|بشكل|بصيغ[ةه]|على\\s+شكل|كملف|بملف)\\s*(?:ملفّ?\\s+)?(?:ال)?|بال|ب|ك)' + FILE_W
  + '|\\b(?:in|as|into|using|via)\\s+(?:(?:an?|the|my)\\s+)?' + EN_FILE + ')', 'i');
const CONV_RE = new RegExp(B_ + '(?:حوّ?ل(?:ها|ه|هم|لي)?|انقل(?:ها|ه|هم|لي)?|فرّ?غ(?:ها|ه|هم|لي)?|convert|turn|transfer|export|make\\s+(?:it|this|that|them)\\s+into)'
  + '(?:\\s+(?:لي|it|this|that|these|them|the|my|هذا|هذي|هذه|هال\\S+|ال\\S+)(?:\\s+\\S+){0,3}?)?'
  + '\\s+(?:إلى|الى|لل|ل|لـ|في|على|into|to|in)\\s*(?:(?:an?|the)\\s+)?(?:(?:ملفّ?|file|جدول|عرض)\\s+)?(?:ال)?' + FILE_W, 'i'); // «حول» = «عن» لا تطابق: بعدها مفعول معرّف ثمّ «إلى» ملفّ
const STICKER_RE = /(ستيكر|ستكر|ملصق|stickers?)/i;
const NOT_OBJ_RE = new RegExp(B_ + ANY_V + '(?:\\s*(?:لي|ني))?\\s+(?:(?:an?|the|one|this|that|my|هذا|هذي|هذه)\\s+)?(?:ال)?'
  + '(?:صور[ةه]?|تصميم|شعار|لوجو|بوستر|خلفي[ةه]|غلاف|بنر|[اأ]يقون[ةه]|زرّ?|[اأ]زرار|كرت|بطاق[ةه]|دعو[ةه]|تبويب|image|picture|photo|pic|logo|poster|background|wallpaper|banner|icon|button|thumbnail|card|invitation|flyer)'
  + '|' + B_ + 'make\\s+(?:it|them)\\b(?!\\s+(?:into|in|as|to)\\b)', 'i');
const OWNER_UI_RE = new RegExp(B_ + '(?:ال)?(?:زرّ?|[اأ]زرار|[اأ]يقون[ةه]|كرت|تبويب|buttons?|icons?|tabs?)(?=$|[\\s،,.!؟?«»"\'()])', 'i');
/* v-office-image: «ابي افتح البوربوينت» و«ابغى استرجع ملف الاكسل» عن البرنامج نفسه لا طلب ملفّ — v-office-explicit: البرنامج مفعول الفعل،
   لا الفعل في أيّ مكان من الجملة («ابي ملف اكسل اثبت فيه حضور الطلاب»، «ابي شيت مصاريف ارجع له»، «backup and restore» طلبات حقيقيّة) */
const APP_USE_RE = new RegExp(B_ + '(?:افتح(?!\\s+لي)|أفتح(?!\\s+لي)|اشغّ?ل|أشغّ?ل|ثبّ?ت|أثبّ?ت|اثبّ?ت|نزّ?ل|أنزّ?ل|انزّ?ل|حمّ?ل|أحمّ?ل|احمّ?ل|استرجع|أسترجع|ارجّ?ع|أرجّ?ع|رجّع|استعيد|أستعيد|open|install|download|recover|restore)'
  + '\\s+(?:(?:my|the|an?|this)\\s+)?(?:(?:ال)?(?:برنامج|ملفّ?|file|app)\\s+)?(?:ال|بال)?(?:' + FILE_W + '|شرائح)', 'i'); // لا «فتح» (فتح مكّة) ولا «شغل» (الشغل)
/* v-office-explicit: «ابي نصايح للبرزنتيشن»، «ابي اتدرب على البرزنتيشن»، «give me tips for my presentation» — يريد نصيحة لا ملفًّا */
const ADVICE_RE = new RegExp(B_ + WANT_V + '(?:\\s*(?:لي|ني))?\\s+(?:(?:some|a\\s+few|few|بعض|شوي[ةه]?|كم)\\s+)?(?:نصايح|نصائح|نصيح[ةه]|تلميحات|[اأ]فكار|[اأ]تدرب|[اأ]تمرن|tips?|advice|ideas|to\\s+practi[cs]e|to\\s+rehearse|practi[cs]e)', 'i');
const EDIT_RE = /(^|[\s،,.!؟?«"'])(كبر|كبّر|صغر|صغّر|زد|زيد|زود|ضيف|أضف|اضف|احذف|امسح|شيل|غير|غيّر|عدل|عدّل|بدل|بدّل|خل|خلّ|خليه|خلّيه|حط|حطّ|لون|لوّن|رتب|رتّب|حول|حوّل|نقص|قلل|قلّل|اجعل|ابي|أبي|اريد|أريد|ودي|سو|سوي|ترجم|كمل|كمّل|add|remove|delete|change|edit|make\s+it|bigger|smaller|rename|translate|more|another|also)(?=$|[\s،,.!؟?»"'])/i;

/** طلب ملفّ Excel/PowerPoint جديد؟ فعل صنع + (اسم الصيغة أو جدول من مجال معروف)، وليس سؤال «كيف» إلّا مع «سوّ لي». */
function isOfficeAsk(text) {
  const s = ownWords(text);
  if (!s || s.length < 4) return false;
  const file = FILE_RE.test(s), domain = DOMAIN_RE.test(s);
  if (!file && !domain) return false;
  if (!MAKE_RE.test(s) && !FOR_ME_RE.test(s) && !CONV_RE.test(s)) return false;
  if ((HOWTO_RE.test(s) || APP_USE_RE.test(s) || ADVICE_RE.test(s)) && !FOR_ME_RE.test(s)) return false;
  return true;
}
/** الطلب الصريح (أ/ب/ج أعلاه) — الجزء الذي ينسخه العميل حرفيًّا. owner: فعل الصنع وحده، وعنصر واجهة في نصّه = لقطة تطبيقه. */
function explicitFileAsk(text, owner) {
  const s = String(text || '').slice(0, 1200);
  if (!s || STICKER_RE.test(s)) return false;
  if (owner && OWNER_UI_RE.test(s)) return false;
  if (CONV_RE.test(s)) return true;
  if (NOT_OBJ_RE.test(s)) return false;
  return (owner ? OBJ_OWNER_RE : OBJ_RE).test(s) || MED_RE.test(s);
}
/** طلب ملفّ مع صورة (لقطة شاشة أو جدول مصوَّر): طلب ملفّ + صريح. «ابي» وحدها مع صورة سؤال عنها في الغالب. */
function isOfficeImageAsk(text, owner) { return isOfficeAsk(text) && explicitFileAsk(ownWords(text), owner); }
/** تعديل على ملفّ هذه المحادثة؟ (ctx = آخر ملفّ في المحادثة من العميل) */
function isOfficeEdit(text, ctx) {
  if (!ctx) return false;
  const s = ownWords(text);
  if (!s || s.length > 600) return false;
  if (HOWTO_RE.test(s) && !EDIT_RE.test(s)) return false;
  return EDIT_RE.test(s) || FILE_RE.test(s);
}
/* ── الاقتراح (قرار المالك ٧ نوفمبر: «1 + 3، ومايكون ثابت — من سوى جدول مرّة وحدة مايطلعله مرّة ثانية») ──
   العميل يرسل officeHint ما دام المستخدم لم يصنع ملفًّا على جهازه (app-44)، والخادم يضيف سطر الاقتراح للنموذج فقط حين يتكلّم
   المستخدم في موضوع ينفعه جدول أو عرض، ولم يُعرض عليه في هذه المحادثة. وجوابه «إيه سوّه» بعد العرض = طلب ملفّ. */
const HINT_RE = /(موظف|عمّال|عمال|طلاب|طالب|طالبات|درجات|علامات|حضور|حظور|غياب|دوام|رواتب|راتب|مصاريف|مصروف|ميزاني|ادخار|توفير|مخزون|بضاع|مبيعات|فواتير|أقساط|اقساط|ديون|جدول|خطة|خطّة|نظّم|انظم|أنظم|تنظيم|قائمة|مشتريات|مهام|محاضرة|اجتماع|تقرير|employees?|staff|students?|grades|attendance|budget|expenses|inventory|sales|invoices?|schedule|organi[sz]e|to-?do|report|presentation|lecture)/i;
const OFFERED_RE = /(excel|إكسل|اكسل|powerpoint|بوربوينت|باوربوينت)/i;
const ACCEPT_RE = /^\s*(ايه|إيه|ايوه|إيوه|اي|أي|نعم|اكيد|أكيد|تمام|اوكي|أوكي|اوك|طيب|زين|يلا|يالله|سوه|سوّه|سويه|سوّيه|سوها|سوّها|جهزه|جهّزه|جهزها|جهّزها|ابيه|أبيه|ابغاه|أبغاه|ابيها|أبيها|ok|okay|yes|yeah|yep|sure|please|go\s*ahead|do\s*it)([\s،,.!؟?]|$)/i;
const msgText = (m) => (typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map((x) => (x && x.text) || '').join(' ') : ''));
function isHintTopic(text) { const s = ownWords(text); return s.length >= 8 && HINT_RE.test(s) && !isOfficeAsk(s); }
/** عُرض الملفّ في هذه المحادثة من قبل؟ (أيّ ردّ سابق ذكر Excel/PowerPoint) — فلا يتكرّر الاقتراح */
function alreadyOffered(messages) { return (messages || []).some((m) => m && m.role === 'assistant' && OFFERED_RE.test(msgText(m))); }
/** «إيه سوّه» جوابًا لآخر ردّ عرض ملفًّا = طلب ملفّ */
function isOfficeAccept(text, messages) {
  const s = ownWords(text);
  if (!s || s.length > 40 || !ACCEPT_RE.test(s)) return false;
  const prev = (messages || []).slice(0, -1).reverse().find((m) => m && m.role === 'assistant');
  return !!(prev && OFFERED_RE.test(msgText(prev)));
}
const HINT_NOTE = '[اقتراح ملفّ — سطر واحد في آخر الردّ]: إن كان ما يتكلّم عنه المستخدم ينفعه ملفّ Excel أو PowerPoint جاهز (جدول، كشف، خطّة، قائمة، عرض)، '
  + 'فأجب أوّلًا كالعادة ثمّ اختم بسطر واحد قصير بلغته يعرض أن تجهّزه له ملفًّا جاهزًا للطباعة (مثل: «أقدر أسوي لك هذا ملف Excel جاهز للطباعة إذا تبي 📄»). إن لم يناسب فلا تذكره.';

/** آخر ملفّ في المحادثة كما أرسله العميل (body.office) — يُنظَّف كأنّه من النموذج؛ تالف = لا شيء. */
function contextSpec(raw) {
  if (!raw || typeof raw !== 'object') return null;
  try { if (JSON.stringify(raw).length > 60000) return null; } catch (e) { return null; } // دائريّ أو تالف — لا سياق
  const r = sanitizeSpec(raw);
  return r.spec || null;
}

/* ── الحصّة الشهريّة ── */
function monthStr(d) { return (d || new Date()).toISOString().slice(0, 7); }
function monthKey(user, d) { return 'db/office-usage/' + encodeURIComponent(String(user).toLowerCase()) + '/' + monthStr(d); }
async function usedThisMonth(user, kv) {
  if (!user) return 0;
  try { const raw = await kv.kvGetRaw(monthKey(user)); return raw != null ? (parseInt(raw, 10) || 0) : 0; }
  catch (e) { return 0; } // عطل KV = مفتوح كبقيّة الحصص
}
/** يحجز ملفّ هذا الشهر ذرّيًّا: { ok, used }. فوق السقف يُردّ ما زاده. */
async function takeMonthly(user, kv, limit) {
  const lim = Number(limit) > 0 ? Number(limit) : FREE_MONTHLY;
  const k = monthKey(user);
  let n;
  try { n = Number(await kv.kvIncr(k)); }
  catch (e) { console.warn('[office] monthly take failed, allowing: ' + (e && e.message)); return { ok: true, used: 1 }; }
  try { if (n === 1) await kv.kvExpire(k, MONTH_TTL_SEC); } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/office:296'); /* guard-ok — المفتاح مؤرَّخ بالشهر فلا يتراكم */ }
  if (n > lim) {
    try { await kv.kvDecrBy(k, 1); } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/office:298'); /* guard-ok — العدّاد فوق السقف أصلًا: لا يفتح شيئًا */ }
    return { ok: false, used: lim };
  }
  return { ok: true, used: n };
}
/** نقل عدّاد الشهر مع تغيير اسم الحساب (كما تنتقل الحصص اليوميّة) — لا ملفّ مجّانيّ جديد بتغيير الاسم. */
async function moveMonth(oldUser, newUser, kv) {
  if (!oldUser || !newUser || String(oldUser).toLowerCase() === String(newUser).toLowerCase()) return;
  try {
    const n = parseInt(await kv.kvGetRaw(monthKey(oldUser)), 10);
    if (n > 0) { await kv.kvIncrBy(monthKey(newUser), n); await kv.kvExpire(monthKey(newUser), MONTH_TTL_SEC); await kv.kvDel(monthKey(oldUser)); }
  } catch (e) { console.warn('[office] rename tally not moved: ' + (e && e.message)); }
}

/* ── الكروت ── */
function cardEvent(office) { return { cards: { kind: 'office', q: '', chips: [], items: [], office } }; }
function gateEvent(gate, used, limit) { return cardEvent({ gate, used: used || 0, limit: limit || FREE_MONTHLY }); }
// سطر الردّ قصير: الكرت تحته يحمل الشرح والزرّ (بلغة الواجهة) — لا يتكرّر الكلام مرّتين.
const GATE_TEXT = {
  ar: { plans: '🔒 خلص ملفّك المجّانيّ لهذا الشهر 👇', login: '🔒 سجّل دخولك أوّلًا 👇' },
  en: { plans: '🔒 Your free file for this month is used 👇', login: '🔒 Please sign in first 👇' },
};
function gateText(gate, text) { const L = /[؀-ۿ]/.test(String(text || '')) ? 'ar' : 'en'; return GATE_TEXT[L][gate] || GATE_TEXT[L].plans; }

/* ── الأداة ── */
const TOOL = {
  name: 'create_office_file',
  description: 'Create a REAL downloadable Excel (.xlsx) or PowerPoint (.pptx) file inside the chat — the user gets a file card with download and print buttons. '
    + 'Use it whenever the user asks for an Excel sheet/table (attendance, grades, shifts, salaries, expenses, inventory, budget…) or a PowerPoint/presentation/slides, and for any edit to a file made earlier in this chat (send the FULL updated spec, not a diff). '
    + 'Do not ask questions first: decide sensible defaults (e.g. 25 blank rows, the current month) and build it complete and impressive in ONE call. Write all text in the user\'s language. '
    + 'You only give the CONTENT; the app applies a professional design automatically (colors, borders, zebra rows, right-to-left, A4 print setup, frozen header, dropdowns, conditional colors). '
    + 'Excel: per sheet give title, subtitle, fields (header fill-in lines like "اسم الجهة"), columns (type: index = auto 1..n, text, number, currency, percent, date, time, hours = auto difference between the first two time columns, choice with choices = dropdown, check, signature, formula with {cN} = column N of the same row, e.g. "=IF({c3}=\\"\\",\\"\\",{c3}*{c4})"), rows (real data if the user gave it) and/or blankRows (empty rows to fill by hand/print), '
    + 'days {month:"YYYY-MM", weekend:[5,6] (0=Sunday), choices:["ح","غ","ت","إ"], legend:[...]} = adds one dropdown column per day of that month plus automatic count columns per choice, totals {label, ops:{"3":"sum"}}, highlight [{value:"غ", color:"red"}], signatures (footer lines), note. A monthly attendance file = sheet 1 daily sign-in sheet (times, signatures, auto hours) + sheet 2 monthly grid with days. '
    + 'PowerPoint: 6-10 slides with varied layouts — title, section, bullets, table, imageText (icon panel + bullets), stats (big numbers), chart (bar/column/line/pie/doughnut with labels and series), twoColumn (left/right), timeline (steps), quote, closing; optional icon from the list and speaker notes. '
    + 'After the tool returns, write ONE short line only (the card shows the file) — never paste the file content as text. If the tool says the free monthly file is used up, tell the user in one line to subscribe (button on the card) and do not write the file content as text.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['xlsx', 'pptx'] },
      title: { type: 'string', description: 'File/document title' },
      fileName: { type: 'string', description: 'Short file name without extension, in the user\'s language' },
      lang: { type: 'string', description: 'ISO code of the user\'s language, e.g. ar, en' },
      theme: { type: 'string', enum: THEMES },
      sheets: {
        type: 'array',
        description: 'Excel only (1-6 sheets)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }, title: { type: 'string' }, subtitle: { type: 'string' },
            fields: { type: 'array', items: { type: 'string' } },
            columns: { type: 'array', items: { type: 'object', properties: { header: { type: 'string' }, type: { type: 'string', enum: COL_TYPES }, width: { type: 'integer' }, choices: { type: 'array', items: { type: 'string' } }, formula: { type: 'string' }, format: { type: 'string', enum: ['number', 'currency', 'percent', 'hours', 'decimal'] }, currency: { type: 'string' } }, required: ['header'] } },
            rows: { type: 'array', items: { type: 'array', items: {} } },
            blankRows: { type: 'integer' },
            days: { type: 'object', properties: { month: { type: 'string' }, weekend: { type: 'array', items: { type: 'integer' } }, choices: { type: 'array', items: { type: 'string' } }, legend: { type: 'array', items: { type: 'string' } } } },
            totals: { type: 'object', properties: { label: { type: 'string' }, ops: { type: 'object' } } },
            highlight: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, color: { type: 'string', enum: COLORS } } } },
            signatures: { type: 'array', items: { type: 'string' } },
            note: { type: 'string' },
            orientation: { type: 'string', enum: ['portrait', 'landscape'] },
          },
        },
      },
      slides: {
        type: 'array',
        description: 'PowerPoint only (up to 20)',
        items: {
          type: 'object',
          properties: {
            layout: { type: 'string', enum: LAYOUTS }, title: { type: 'string' }, subtitle: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            table: { type: 'object', properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: {} } } } },
            stats: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } } } },
            chart: { type: 'object', properties: { type: { type: 'string', enum: CHARTS }, labels: { type: 'array', items: { type: 'string' } }, series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } } } } } },
            left: { type: 'object', properties: { heading: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } } },
            right: { type: 'object', properties: { heading: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } } },
            steps: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } } } },
            quote: { type: 'string' }, author: { type: 'string' },
            icon: { type: 'string', enum: ICONS }, imageCaption: { type: 'string' }, notes: { type: 'string' },
          },
        },
      },
    },
    required: ['kind', 'title'],
  },
};

/** ملاحظة النظام لدور فيه طلب ملفّ أو تعديل (ctx = الملفّ الحاليّ للتعديل). */
function systemNote(opts) {
  const o = opts || {};
  const d = o.now instanceof Date ? o.now : new Date();
  let s = '\n\n[ملفّ Excel/PowerPoint — إلزاميّ في هذا الردّ]: المستخدم يطلب ملفًّا. استدعِ create_office_file مرّة واحدة الآن بمحتوى كامل غنيّ '
    + '(بلا أسئلة قبله، وبافتراضات معقولة: الشهر الحاليّ ' + monthStr(d) + '، ٢٥ صفًّا فارغًا للتعبئة إن لم يعطِ أسماء). اجعل النسخة الأولى مبهرة: عنوان ووصف، '
    + 'حقول ترويسة، معادلات تحسب وحدها، قوائم منسدلة، ألوان شرطيّة، مجاميع، تواقيع، وورقة ثانية حين تفيد؛ وفي العرض ٦–١٠ شرائح بتخطيطات متنوّعة '
    + '(أرقام كبيرة، رسم بيانيّ، جدول، خطّ زمنيّ). بعد الأداة سطر واحد قصير فقط — لا تكتب محتوى الملفّ نصًّا.';
  /* v-office-image: صورة مع طلب الملفّ — تعليمات دور الصورة (edit_image، إرشاد الشاشة) كانت تنافس الملفّ */
  if (o.image) s += '\n[صورة مرفقة مع طلب الملفّ]: إن كان فيها جدول أو أسماء أو أرقام أو نصّ للملفّ فانقله كما هو بترتيبه (صفوف حقيقيّة لا فارغة)؛ '
    + 'وإن كانت لقطة شاشة بلا محتوى للملفّ فابنِه من طلبه وسياق المحادثة. لا edit_image ولا generate_image في هذا الردّ، ولا تصف الصورة.';
  if (o.ctx) {
    let j = '';
    try { j = JSON.stringify(o.ctx); } catch (e) { j = ''; }
    if (j) s += '\n[الملفّ الحاليّ في هذه المحادثة — المستخدم يعدّل عليه]: أعد استدعاء create_office_file بالمخطّط الكامل بعد التعديل (احتفظ بكلّ ما لم يطلب تغييره):\n' + j.slice(0, 30000);
  }
  return s;
}

/** تنفيذ الأداة في دور المحادثة: { result للنموذج، event كرت أو null }. ctx: { user, subscriber, kv } */
async function createFile(input, ctx) {
  const c = ctx || {};
  const r = sanitizeSpec(input);
  if (r.error) return { result: '✗ ' + r.error + ' — أصلح المخطّط وأعد الاستدعاء مرّة واحدة.', event: null };
  const spec = r.spec;
  if (!c.subscriber) {
    if (!c.user) return { result: '✗ المستخدم غير مسجّل: الملفّ المجّانيّ الشهريّ يحتاج تسجيل الدخول. قل له ذلك في سطر واحد (الزرّ على الكرت) ولا تكتب محتوى الملفّ نصًّا.', event: gateEvent('login') };
    const t = await takeMonthly(c.user, c.kv, c.limit);
    if (!t.ok) return { result: '✗ استخدم المستخدم ملفّه المجّانيّ لهذا الشهر (التعديل ملفّ جديد). قل له في سطر واحد إنّ الملفّات الجديدة والتعديل بالاشتراك (الزرّ على الكرت). لا تكتب محتوى الملفّ نصًّا.', event: gateEvent('plans', t.used, c.limit) };
    spec.free = true;
  }
  const id = 'of' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const count = spec.kind === 'xlsx' ? spec.sheets.length : spec.slides.length;
  const what = spec.kind === 'xlsx' ? ('ملفّ Excel «' + spec.fileName + '.xlsx» (' + count + ' ورقة)') : ('عرض PowerPoint «' + spec.fileName + '.pptx» (' + count + ' شريحة)');
  const tail = spec.free ? ' هذا ملفّ المستخدم المجّانيّ لهذا الشهر: التعديل عليه أو ملفّ آخر يحتاج اشتراكًا.' : '';
  return { result: '✓ ظهر للمستخدم كرت ' + what + ' بأزرار التحميل وPDF للطباعة.' + tail + ' اكتب سطرًا واحدًا قصيرًا فقط.', event: cardEvent({ id, spec }) };
}

module.exports = {
  TOOL, FREE_MONTHLY, sanitizeSpec, isOfficeAsk, isOfficeImageAsk, explicitFileAsk, EXPLICIT: { STICKER_RE, CONV_RE, NOT_OBJ_RE, OBJ_RE, MED_RE }, isOfficeEdit, contextSpec, ownWords, systemNote, createFile, isHintTopic, alreadyOffered, isOfficeAccept, HINT_NOTE,
  usedThisMonth, takeMonthly, moveMonth, monthKey, gateEvent, gateText, cardEvent, formula,
};
