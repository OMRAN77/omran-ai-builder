// api/_lib/code-analyze.js — v-code-score: «يقرأ الأكواد ويحلّل كلّ شيء ويعطي الأفضل».
//
// المسار: /api/tools?action=code-analyze (POST، بثّ SSE).
// المدخل: ملفّات نصّية {files:[{name,content}]} و/أو أرشيف zip (fileBase64) وسؤال
// تركيز اختياريّ. المخرج: تقرير مُهيكل واحد {report} — تحليل تفصيليّ حرّ (deep)،
// درجة من ١٠٠، ستّ فئات، نقاط القوّة، المشاكل بخطورتها وملفّها وسطرها وإصلاحها،
// توصيات مرتّبة من الأعلى قيمة، وترتيب الملفّات من الأفضل، مع قياسات محلّية.
//
// قرارات:
// (١) المشترك على المحرّك الاحترافيّ (كلود مباشرةً كما في chat.js)، وغير المشترك
//     على السلسلة المجانيّة بلا اسم مزوّد (قرار الطبقات ١٢ سبتمبر) — وبسقف نصّ أصغر.
// (٢) الأسطر تُرقَّم قبل الإرسال (N| …) كي تكون أرقام السطور في التقرير حقيقيّة.
// (٣) الردّ جزآن: @@ANALYSIS تحليل حرّ عميق (يُعرض للمستخدم ويُجبر النموذج على المرور
//     على كلّ شيء قبل الحكم) ثمّ @@REPORT وJSON واحد يُستخرج بتسامح ويُطبَّع. فشل
//     الاستخراج لا يُسقط الطلب: يبقى التحليل الحرّ ويغيب الرقم.
// (٤) القياسات المحلّية (TODO، console.log، eval، innerHTML، ==، var، سرّ مكتوب،
//     except عامّة…) تُحسب هنا وتُرسل للنموذج كتلميح وتُعرض للمستخدم كما هي.
// (٥) v-code-depth (شكوى المالك «التقرير طلع ضعيف»): النموذج الافتراضيّ claude-opus-5
//     بتفكير تكيّفيّ وجهد xhigh، بلا معاملات عيّنة (الجيل الحاليّ يرفض temperature
//     بـ400)، وسقف إخراج واسع، واحتياط رفض من الخادم (fallbacks: default) على مسار
//     أنثروبيك المباشر. الحدود: ٢٠٠ ألف حرف للملفّ و٥٠٠ ألفًا للطلب للمشترك.
'use strict';

const { checkAndConsume, clientIp } = require('./_usage.js');
const tierLib = require('./tier.js');
const { streamFreeChain } = require('./free-chain.js');
const { logError } = require('./log-error.js');
const zipLib = require('./analyze-zip.js');
const gh = require('./github-read.js'); // v-agent-github: رابط مستودع/مجلّد/ملفّ على GitHub

const LIMITS = { files: 60, perFile: 200000, total: 500000, perFileFree: 60000, totalFree: 60000, ask: 1200 };
const ZIP_MAX = 3 * 1024 * 1024;
const NUL = String.fromCharCode(0);
const DEFAULT_MODEL = 'claude-opus-5';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const MARK_A = '@@ANALYSIS';
const MARK_R = '@@REPORT';

const LANG_BY_EXT = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'React JSX', ts: 'TypeScript', tsx: 'React TSX',
  py: 'Python', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', less: 'LESS', json: 'JSON', md: 'Markdown',
  php: 'PHP', java: 'Java', kt: 'Kotlin', swift: 'Swift', go: 'Go', rs: 'Rust', c: 'C', h: 'C', cpp: 'C++',
  hpp: 'C++', cs: 'C#', rb: 'Ruby', sh: 'Shell', bash: 'Shell', sql: 'SQL', yml: 'YAML', yaml: 'YAML',
  xml: 'XML', vue: 'Vue', svelte: 'Svelte', dart: 'Dart', toml: 'TOML', txt: 'Text',
};
const JS_FAMILY = { js: 1, mjs: 1, cjs: 1, jsx: 1, ts: 1, tsx: 1, vue: 1, svelte: 1, html: 1, htm: 1 };
const HASH_COMMENT = { py: 1, sh: 1, bash: 1, yml: 1, yaml: 1, rb: 1, toml: 1 };

function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
function langOf(name) { const e = extOf(name); return LANG_BY_EXT[e] || (e ? e.toUpperCase() : 'Text'); }
function familyOf(name) { const e = extOf(name); return JS_FAMILY[e] ? 'js' : (e === 'py' ? 'py' : 'other'); }

/* ---------- جمع الملفّات (نصّ مباشر + أرشيف) ---------- */
function collectFiles(body, limits) {
  const L = Object.assign({}, LIMITS, limits || {});
  const files = [];
  const skipped = [];
  let total = 0;
  const push = (name, content) => {
    const nm = String(name || 'file').slice(0, 200);
    if (files.length >= L.files) { skipped.push({ name: nm, why: 'limit' }); return; }
    let text = String(content == null ? '' : content);
    if (!text.trim()) { skipped.push({ name: nm, why: 'empty' }); return; }
    if (text.indexOf(NUL) !== -1) { skipped.push({ name: nm, why: 'binary' }); return; }
    let truncated = false;
    if (text.length > L.perFile) { text = text.slice(0, L.perFile); truncated = true; }
    if (total + text.length > L.total) {
      const room = L.total - total;
      if (room < 2000) { skipped.push({ name: nm, why: 'total' }); return; }
      text = text.slice(0, room); truncated = true;
    }
    total += text.length;
    files.push({ name: nm, content: text, truncated });
  };
  if (Array.isArray(body.files)) {
    for (const f of body.files) if (f && typeof f === 'object') push(f.name, f.content);
  }
  const pushEntries = (entries) => {
    for (const e of entries) {
      if (!e || !e.name || /\/$/.test(e.name)) continue;
      if (zipLib.SKIP_DIR_PATTERNS.some((p) => p.test(e.name))) continue;
      if (zipLib.BINARY_EXT.test(e.name)) continue;
      if (!zipLib.TEXT_EXT.test(e.name) && e.data.length > 200000) continue;
      let t;
      try { t = e.data.toString('utf8'); } catch (err) { continue; }
      push(e.name, t);
    }
  };
  if (body.fileBase64) {
    let buf = null;
    try { buf = Buffer.from(String(body.fileBase64), 'base64'); } catch (e) { buf = null; }
    const zipName = String(body.filename || 'archive.zip').slice(0, 200);
    if (buf && buf.length > ZIP_MAX) skipped.push({ name: zipName, why: 'toolarge' });
    else if (buf && buf.length) {
      let entries = [];
      try { entries = zipLib.unzip(buf); } catch (e) { skipped.push({ name: zipName, why: 'badzip' }); }
      pushEntries(entries);
    }
  }
  // مدخلات فُكّت مسبقًا (أرشيف GitHub جُلب في المعالج) — نفس المرشّحات.
  if (Array.isArray(body._zipEntries)) pushEntries(body._zipEntries);
  return { files, skipped, total };
}

/* ---------- القياسات المحلّية ---------- */
const FLAG_DEFS = [
  { key: 'todo', fam: null, label: 'ملاحظات TODO/FIXME معلّقة', re: /\b(?:TODO|FIXME|XXX|HACK)\b/ },
  { key: 'secret', fam: null, label: 'سرّ أو مفتاح مكتوب داخل الكود', re: /(?:api[_-]?key|secret|passw(?:or)?d|token)\s*[:=]\s*['"`][^'"`\s]{8,}['"`]|\bsk-[A-Za-z0-9_-]{20,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}/i },
  { key: 'console', fam: 'js', label: 'console.log متبقٍّ', re: /\bconsole\.(?:log|debug)\s*\(/ },
  { key: 'eval', fam: 'js', label: 'eval / new Function', re: /\beval\s*\(|\bnew\s+Function\s*\(/ },
  { key: 'innerhtml', fam: 'js', label: 'innerHTML / document.write (خطر XSS)', re: /\.innerHTML\s*\+?=|\bdocument\.write\s*\(/ },
  { key: 'looseeq', fam: 'js', label: 'مقارنة غير صارمة (== أو !=)', re: /(?:^|[^=!<>])(?:==|!=)(?!=)/ },
  { key: 'var', fam: 'js', label: 'var بدل let/const', re: /^\s*var\s+[A-Za-z_$]/ },
  { key: 'bareexcept', fam: 'py', label: 'except: عامّة تبتلع كلّ خطأ', re: /^\s*except\s*:/ },
  { key: 'print', fam: 'py', label: 'print متبقٍّ', re: /^\s*print\s*\(/ },
];
const LONG_LINE = 140;

function isCommentLine(t, ext) {
  if (!t) return false;
  if (HASH_COMMENT[ext]) return t[0] === '#';
  if (ext === 'sql' || ext === 'lua') return t.indexOf('--') === 0;
  return t.indexOf('//') === 0 || t.indexOf('/*') === 0 || t[0] === '*' || t.indexOf('<!--') === 0;
}

function fileMetrics(f) {
  const ext = extOf(f.name);
  const fam = familyOf(f.name);
  const lines = String(f.content || '').split('\n');
  let blank = 0, comments = 0, longLines = 0, longest = 0;
  const hits = {};
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) { blank++; continue; }
    if (raw.length > longest) longest = raw.length;
    if (raw.length > LONG_LINE) longLines++;
    if (isCommentLine(t, ext)) { comments++; continue; }
    for (const d of FLAG_DEFS) {
      if (d.fam && d.fam !== fam) continue;
      if (!d.re.test(raw)) continue;
      const h = hits[d.key] || (hits[d.key] = { key: d.key, label: d.label, count: 0, lines: [] });
      h.count++;
      if (h.lines.length < 5) h.lines.push(i + 1);
    }
  }
  const flags = FLAG_DEFS.filter((d) => hits[d.key]).map((d) => hits[d.key]);
  if (longLines) flags.push({ key: 'longline', label: 'أسطر أطول من ' + LONG_LINE + ' حرفًا', count: longLines, lines: [] });
  return { name: f.name, lang: langOf(f.name), lines: lines.length, chars: String(f.content || '').length, blank, comments, longest, truncated: !!f.truncated, flags };
}

function metricsOf(files) {
  const perFile = files.map(fileMetrics);
  const totals = { files: perFile.length, lines: 0, chars: 0, comments: 0, flags: {} };
  for (const m of perFile) {
    totals.lines += m.lines; totals.chars += m.chars; totals.comments += m.comments;
    for (const fl of m.flags) totals.flags[fl.key] = (totals.flags[fl.key] || 0) + fl.count;
  }
  const langs = {};
  for (const m of perFile) langs[m.lang] = (langs[m.lang] || 0) + m.lines;
  totals.languages = Object.keys(langs).sort((a, b) => langs[b] - langs[a]).slice(0, 6);
  return { files: perFile, totals };
}

/* ---------- التعليمة ---------- */
const CATS = ['correctness', 'security', 'performance', 'readability', 'maintainability', 'best_practices'];

function reportLanguage(lang) {
  const l = String(lang || 'ar').toLowerCase().slice(0, 2);
  const names = { ar: 'العربية', ur: 'الأردية', en: 'English', fr: 'Français', hi: 'हिन्दी', bn: 'বাংলা', ne: 'नेपाली', id: 'Bahasa Indonesia', fi: 'Filipino', tr: 'Türkçe', zh: '中文', ru: 'Русский', es: 'Español', ml: 'മലയാളം' };
  return names[l] || 'English';
}

function numbered(text) {
  return String(text || '').split('\n').map((l, i) => (i + 1) + '| ' + l).join('\n');
}

function buildPrompt(files, metrics, ask, lang) {
  const outLang = reportLanguage(lang);
  const system = [
    'أنت كبير مراجعي الكود (مهندس أوّل يراجع قبل الدمج): خبير في الصحّة والأمان والأداء والقابليّة للصيانة عبر كلّ اللغات. تقرأ كلّ سطر، ولا تخترع مشكلة غير موجودة، ولا تُغفل مشكلة حقيقيّة، ولا تكتفي بالعموميّات.',
    'المطلوب: تحليل شامل للملفّات المرفقة وتقييمها، ثمّ إعطاء أفضل ما يمكن فعله بها.',
    '',
    '[نطاق التحليل — كلّه]: (١) أخطاء منطقيّة وحالات حدّيّة وأعطال محتملة (قيم فارغة، تزامن، حالات سباق، مدخلات غير متوقّعة). (٢) ثغرات أمنيّة (حقن، XSS، أسرار مكتوبة، تحقّق مفقود، صلاحيّات، تسريب بيانات). (٣) الأداء والتعقيد والذاكرة والشبكة. (٤) الوضوح والتسمية والتنظيم. (٥) القابليّة للصيانة والتكرار والاقتران والاختبار. (٦) أفضل ممارسات اللغة والإطار، ومعالجة الأخطاء، وإمكانيّة الوصول في HTML، والاعتماديّات، وما ينقص (اختبارات، توثيق، سجلّات).',
    '',
    '[شكل الإخراج — إلزاميّ مطلق]: ردّك من جزأين بهذا الترتيب وبهذين العنوانين حرفيًّا:',
    MARK_A,
    '(تحليل تفصيليّ حرّ بصيغة Markdown، بلغة ' + outLang + '، بعمق حقيقيّ: ١) ماذا يفعل الكود وبنيته وتدفّق البيانات فيه. ٢) مرور على كلّ ملفّ ثمّ على كلّ دالّة أو قسم مهمّ فيه: ما يعمل صحيحًا، وما يُخشى منه، مع أرقام السطور من الترقيم المرفق. ٣) الأخطاء المحتملة وحالات الحدّ التي تكسره. ٤) الأمان. ٥) الأداء. ٦) الجودة والصيانة. ٧) ما ينقص. لا عموميّات: كلّ ملاحظة مربوطة بموضع وسبب وأثر.)',
    MARK_R,
    '(JSON واحد فقط بالشكل أدناه، مبنيّ من تحليلك أعلاه بلا إسقاط أيّ ملاحظة ذكرتها، بلا أسوار كود وبلا أيّ نصّ بعده)',
    '',
    '[قواعد الدرجات]: score من ٠ إلى ١٠٠ يعكس الحالة الحقيقيّة: ٩٠+ جاهز للإنتاج بملاحظات طفيفة، ٧٥–٨٩ جيّد يحتاج تحسينات، ٦٠–٧٤ متوسّط فيه مشاكل واضحة، ٤٥–٥٩ ضعيف، أقلّ من ٤٥ فيه أعطال أو ثغرات خطيرة. وجود مشكلة critical أمنيّة يجعل score لا يتجاوز ٦٠. كلّ فئة في categories تُقيَّم على حدة.',
    '[قواعد المشاكل]: اذكر كلّ مشكلة حقيقيّة (الحدّ الأقصى ٤٠؛ ادمج المتكرّر في مشكلة واحدة تذكر مواضعه). ملفّ يتجاوز ٨٠ سطرًا يُتوقّع فيه عادةً ثماني مشاكل فأكثر ما لم يكن نظيفًا فعلًا — وإن قلّت فاذكر في summary لماذا. لكلّ مشكلة: severity وcategory واسم الملفّ ورقم السطر من الترقيم المرفق، وdetail من جملتين فأكثر (ما الخطأ، متى يحدث، وما أثره)، وfix عمليّ بخطوات محدّدة ومقتطف كود قصير عند الإمكان. رتّبها من الأخطر.',
    '[قواعد التوصيات]: recommendations خمس فأكثر (الحدّ ١٥)، كلّ واحدة محدّدة باسم الملفّ أو الدالّة وما يُفعل بالضبط، مرتّبة من الأعلى قيمة — أوّلها هو أفضل خطوة تالية.',
    '[قواعد الباقي]: strengths ثلاث فأكثر ملموسة (لا «الكود منظّم» بل ما الذي نُظِّم جيّدًا وأين). summary ثلاث إلى خمس جمل: ماذا يفعل الكود، بنيته، وحالته. files تحوي كلّ ملفّ مرفق بدرجته وجملة حكم، كي يُرتَّب الأفضل فالأضعف. verdict حاسم: هل الكود جاهز؟ وما أفضل ما يُفعل به الآن؟',
    '',
    '{',
    '  "summary": "ثلاث إلى خمس جمل: ماذا يفعل الكود وبنيته وحالته",',
    '  "language": "اللغة أو الإطار الرئيسيّ",',
    '  "score": 0,',
    '  "categories": {"correctness": 0, "security": 0, "performance": 0, "readability": 0, "maintainability": 0, "best_practices": 0},',
    '  "strengths": ["نقطة قوّة ملموسة بموضعها"],',
    '  "issues": [{"severity": "critical|high|medium|low|info", "category": "correctness|security|performance|readability|maintainability|best_practices", "file": "اسم الملفّ", "line": 12, "title": "عنوان قصير", "detail": "ما الخطأ، متى يحدث، وما أثره", "fix": "كيف يُصلح بالضبط، مع مقتطف كود قصير إن لزم"}],',
    '  "recommendations": ["أفضل خطوة تالية محدّدة", "ثمّ التالية"],',
    '  "files": [{"name": "اسم الملفّ", "score": 0, "note": "جملة حكم"}],',
    '  "verdict": "حكم نهائيّ حاسم في جملتين"',
    '}',
    'النصوص داخل JSON بلغة: ' + outLang + '. أسماء المتغيّرات والدوالّ ومقتطفات الكود تبقى كما هي. الأسطر الجديدة داخل النصوص تُكتب \\n. لا تعليقات داخل JSON.',
  ].join('\n');

  const blocks = files.map((f) => {
    const n = String(f.content || '').split('\n').length;
    return '=== FILE: ' + f.name + ' (' + langOf(f.name) + ' · ' + n + ' سطرًا' + (f.truncated ? ' · مقتطع لطوله — حلّل ما وصل واذكر أنّ الباقي لم يصل' : '') + ') ===\n'
      + numbered(f.content) + '\n=== END FILE ===';
  });
  const mt = metrics && metrics.totals ? metrics.totals : null;
  const hints = [];
  if (mt) {
    for (const k of Object.keys(mt.flags || {})) {
      const d = FLAG_DEFS.find((x) => x.key === k);
      hints.push((d ? d.label : k) + ': ' + mt.flags[k]);
    }
  }
  let user = '[الملفّات تحت التحليل — ' + files.length + ' ملفًّا' + (mt ? ' · ' + mt.lines + ' سطرًا' : '') + ']\n\n' + blocks.join('\n\n');
  if (hints.length) user += '\n\n[قياسات آليّة أوّليّة — تحقّق منها ولا تعتمدها عمياء]: ' + hints.join(' · ');
  const a = String(ask || '').trim().slice(0, LIMITS.ask);
  if (a) user += '\n\n[تركيز إضافيّ طلبه المستخدم]: ' + a;
  user += '\n\nحلّل كلّ شيء بعمق: ابدأ بـ' + MARK_A + ' ثمّ ' + MARK_R + ' ثمّ JSON التقرير.';
  return { system, user };
}

/* ---------- فصل الجزأين واستخراج JSON بتسامح ---------- */
function splitOutput(text) {
  const t = String(text || '');
  const iR = t.lastIndexOf(MARK_R);
  if (iR === -1) {
    const iA0 = t.indexOf(MARK_A);
    return { deep: iA0 === -1 ? '' : t.slice(iA0 + MARK_A.length).trim().slice(0, 30000), jsonText: t };
  }
  let deep = t.slice(0, iR);
  const iA = deep.indexOf(MARK_A);
  if (iA !== -1) deep = deep.slice(iA + MARK_A.length);
  return { deep: deep.trim().slice(0, 30000), jsonText: t.slice(iR + MARK_R.length) };
}

function escapeCtrlInStrings(s) {
  let out = '', inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch; continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

function extractJson(text) {
  let t = String(text || '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const cand = t.slice(a, b + 1);
  const tries = [cand, escapeCtrlInStrings(cand), escapeCtrlInStrings(cand).replace(/,\s*([}\]])/g, '$1')];
  for (const c of tries) {
    try { const v = JSON.parse(c); if (v && typeof v === 'object') return v; } catch (e) { /* جرّب الصيغة التالية */ }
  }
  return null;
}

/* ---------- التطبيع ---------- */
const SEV = ['critical', 'high', 'medium', 'low', 'info'];
function gradeOf(score) {
  if (score == null) return null;
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';
}
function clamp100(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null; }
function str(v, max) { return (typeof v === 'string' ? v : (v == null ? '' : String(v))).trim().slice(0, max || 2000); }
function strList(v, max, each) { return (Array.isArray(v) ? v : []).map((x) => str(typeof x === 'object' && x ? (x.text || x.title || JSON.stringify(x)) : x, each || 600)).filter(Boolean).slice(0, max); }

function normalizeReport(raw, rawText, deep) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const categories = {};
  for (const c of CATS) categories[c] = clamp100(r.categories && r.categories[c]);
  let score = clamp100(r.score);
  if (score == null) {
    const vals = CATS.map((c) => categories[c]).filter((v) => v != null);
    score = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null;
  }
  const issues = (Array.isArray(r.issues) ? r.issues : []).slice(0, 60).map((it) => {
    const o = it && typeof it === 'object' ? it : { title: str(it, 300) };
    const sev = str(o.severity, 20).toLowerCase();
    const cat = str(o.category, 40).toLowerCase().replace(/[\s-]+/g, '_');
    const ln = parseInt(o.line, 10);
    return {
      severity: SEV.indexOf(sev) === -1 ? 'medium' : sev,
      category: CATS.indexOf(cat) === -1 ? 'best_practices' : cat,
      file: str(o.file, 200), line: Number.isFinite(ln) && ln > 0 ? ln : null,
      title: str(o.title, 300), detail: str(o.detail, 2500), fix: str(o.fix, 3000),
    };
  }).filter((it) => it.title || it.detail);
  issues.sort((x, y) => SEV.indexOf(x.severity) - SEV.indexOf(y.severity));
  const counts = {};
  for (const s of SEV) counts[s] = 0;
  for (const it of issues) counts[it.severity]++;
  const files = (Array.isArray(r.files) ? r.files : []).slice(0, 60).map((f) => {
    const o = f && typeof f === 'object' ? f : {};
    return { name: str(o.name, 200), score: clamp100(o.score), note: str(o.note, 500) };
  }).filter((f) => f.name);
  files.sort((x, y) => (y.score == null ? -1 : y.score) - (x.score == null ? -1 : x.score));
  const deepText = str(deep, 30000);
  // بلا JSON وبلا تحليل حرّ: يُعرض نصّ النموذج الخام ملخّصًا كي لا يضيع شيء.
  const summary = str(r.summary, 3000) || ((raw || deepText) ? '' : str(rawText, 4000));
  return {
    summary, language: str(r.language, 80), score, grade: gradeOf(score), categories,
    strengths: strList(r.strengths, 12), issues, counts, recommendations: strList(r.recommendations, 15, 800),
    files, verdict: str(r.verdict, 1200), deep: deepText, parsed: !!raw,
  };
}

/* ---------- المحرّكان ---------- */
function pickEffort(v) { const e = String(v || '').trim().toLowerCase(); return EFFORTS.indexOf(e) === -1 ? 'xhigh' : e; }

async function callPro(prompt, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const viaOR = !env.ANTHROPIC_API_KEY && !!env.OPENROUTER_API_KEY;
  const apiKey = viaOR ? env.OPENROUTER_API_KEY : env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('missing ANTHROPIC_API_KEY / OPENROUTER_API_KEY');
  const url = viaOR ? 'https://openrouter.ai/api/v1/messages' : 'https://api.anthropic.com/v1/messages';
  const base = (env.CODE_ANALYZE_MODEL && String(env.CODE_ANALYZE_MODEL).trim()) || DEFAULT_MODEL;
  const model = viaOR && base.indexOf('/') === -1 ? 'anthropic/' + base : base;
  const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  // بلا temperature: الجيل الحاليّ يرفض معاملات العيّنة بـ400. التفكير التكيّفيّ
  // والجهد على مسار أنثروبيك المباشر فقط (الوسيط لا يضمن تمريرهما).
  const body = { model, max_tokens: o.maxTokens || (viaOR ? 16000 : 32000), system: prompt.system, messages: [{ role: 'user', content: prompt.user }], stream: true };
  if (!viaOR) {
    body.thinking = { type: 'adaptive' };
    body.output_config = { effort: pickEffort(o.effort || env.CODE_ANALYZE_EFFORT) };
    // احتياط الرفض من الخادم: مصنّفات الأمان قد ترفض كودًا حسّاسًا (أمن/شبكات)،
    // فيُعاد الطلب على نموذج بديل بدل تقرير فارغ. مدعوم على Opus 5 وما فوقه.
    if (/^claude-(?:opus-5|fable)/.test(base)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
  }
  const fetchImpl = o.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs || 280000);
  let text = '';
  let stopReason = null;
  let refusalCategory = '';
  try {
    const r = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok || !r.body) {
      const e = r && r.text ? await r.text().catch(() => '') : '';
      throw new Error('code-analyze upstream ' + (r && r.status) + ': ' + String(e).slice(0, 200));
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
          text += ev.delta.text;
          if (o.onProgress) o.onProgress(text.length);
        } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
          stopReason = ev.delta.stop_reason;
          if (stopReason === 'refusal' && ev.delta.stop_details) refusalCategory = String(ev.delta.stop_details.category || '');
        } else if (ev.type === 'error') {
          throw new Error('code-analyze upstream error: ' + String((ev.error && ev.error.message) || '').slice(0, 200));
        }
      }
    }
    if (stopReason === 'refusal') {
      const e = new Error('refusal' + (refusalCategory ? ': ' + refusalCategory : ''));
      e.refusal = true;
      throw e;
    }
    if (stopReason === 'max_tokens') logError('code-analyze/max-tokens', new Error('report cut at max_tokens after ' + text.length + ' chars'));
    return text;
  } finally { clearTimeout(timer); }
}

async function callFree(prompt, opts) {
  const o = opts || {};
  let text = '';
  // السلسلة المجانيّة بلا تفكير: التذكير في ذيل الرسالة يُثبّت الشكل (النماذج توزنه أعلى).
  const user = prompt.user + '\n\n[تذكير بالشكل — إلزاميّ]: اكتب ' + MARK_A + ' ثمّ التحليل التفصيليّ، ثمّ ' + MARK_R + ' ثمّ JSON التقرير وحده بلا أسوار كود.';
  const r = await streamFreeChain({
    system: prompt.system, convo: [{ role: 'user', content: user }],
    send: (ev) => { if (ev && ev.delta) { text += ev.delta; if (o.onProgress) o.onProgress(text.length); } },
    maxTokens: o.maxTokens || 8000, timeoutMs: o.timeoutMs || 150000, env: o.env, fetchImpl: o.fetchImpl,
  });
  if (!r.ok) { const e = new Error('free-busy: ' + (Array.isArray(r.errors) ? r.errors.join(' | ') : '').slice(0, 300)); e.freeBusy = true; throw e; }
  return r.text || text;
}

/* ---------- المعالج ---------- */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') { res.status(400).json({ error: 'طلب غير مفهوم.' }); return; }
  const token = typeof body.token === 'string' ? body.token : '';
  const guestId = typeof body.guestId === 'string' ? body.guestId : '';

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();
  const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); if (res.flush) res.flush(); } catch (e) { /* العميل أغلق المجرى */ } };
  const ka = setInterval(() => { try { res.write(': ka\n\n'); if (res.flush) res.flush(); } catch (e) { /* العميل أغلق المجرى */ } }, 4000);
  const finish = () => { clearInterval(ka); try { res.end(); } catch (e) { /* المجرى مُغلق أصلًا */ } };

  try {
    send({ status: '📂 يقرأ الملفّات…', k: 'stReading' });
    let tier = null;
    try {
      const { verifyToken } = require('./auth.js');
      tier = await tierLib.resolveTier(token ? verifyToken(token) : null);
    } catch (e) { tier = null; }
    const subscriber = !!(tier && tier.subscriber);
    const usage = await checkAndConsume(token, guestId, subscriber ? 'claude' : 'chat', clientIp(req), { tier: tier || undefined });
    if (!usage.allowed) {
      if (usage.reason === 'auth') send({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      else if (usage.tier === 'guest' || usage.tier === 'free') send({ tier: usage.tier + '-limit', error: usage.message || (usage.tier === 'guest' ? tierLib.FREE_TEXT.guestLimit : tierLib.FREE_TEXT.freeLimit) });
      else send({ error: usage.message || 'وصلت للحدّ اليوميّ. انتظر الغد.' });
      finish(); return;
    }
    const pro = !!usage.subscriber;
    // v-agent-github: رابط GitHub → ملفّ واحد عبر contents، أو مستودع/مجلّد كأرشيف zipball.
    if (typeof body.githubUrl === 'string' && body.githubUrl.trim()) {
      const t = gh.parseTarget({ url: body.githubUrl, ref: body.githubRef });
      if (!t) { send({ error: 'رابط GitHub غير مفهوم. أعطِ رابط مستودع أو مجلّد أو ملفّ.' }); finish(); return; }
      if (t.kind === 'pr' || t.kind === 'issue') { send({ error: 'أعطِ رابط مستودع أو مجلّد أو ملفّ على GitHub — لا طلب سحب أو مسألة.' }); finish(); return; }
      send({ status: '🐙 يحمّل من GitHub: ' + t.owner + '/' + t.repo + (t.path ? '/' + t.path : '') + '…', k: 'stGithub' });
      try {
        let asFile = null;
        if (t.kind === 'file' || t.kind === 'path') {
          const c = await gh.getContents(t, {});
          if (c.error && t.kind === 'file') { send({ error: c.error }); finish(); return; }
          if (c.type === 'file') asFile = c;
        }
        if (asFile) { body.files = (Array.isArray(body.files) ? body.files : []).concat([{ name: asFile.name || t.path, content: asFile.content }]); }
        else { const z = await gh.fetchRepoZip(t, {}); body._zipEntries = z.entries; }
      } catch (e) {
        logError('code-analyze/github', e);
        send({ error: 'تعذّر جلب GitHub: ' + String((e && e.message) || e).slice(0, 200) }); finish(); return;
      }
    }
    const col = collectFiles(body, pro ? null : { total: LIMITS.totalFree, perFile: LIMITS.perFileFree });
    if (!col.files.length) {
      const bad = col.skipped.find((s) => s.why === 'badzip' || s.why === 'toolarge');
      send({ error: bad ? (bad.why === 'badzip' ? 'الملفّ ليس أرشيف zip صالحًا.' : 'الأرشيف أكبر من ٣ ميجابايت — احذف node_modules والملفّات الثقيلة.') : 'لم يصل أيّ ملفّ نصّيّ قابل للتحليل.' });
      finish(); return;
    }
    const metrics = metricsOf(col.files);
    send({ status: '🔎 يقرأ ' + col.files.length + ' ملفًّا · ' + metrics.totals.lines + ' سطرًا ويفكّر…', k: 'stAnalyze', tier: usage.tier });
    const prompt = buildPrompt(col.files, metrics, body.ask, body.lang);
    let lastSent = 0;
    const onProgress = (n) => { if (n - lastSent >= 1500) { lastSent = n; send({ status: '✍️ يكتب التحليل… ' + n + ' حرفًا', k: 'stWriting' }); } };
    let text = '';
    try {
      text = pro ? await callPro(prompt, { onProgress }) : await callFree(prompt, { onProgress });
    } catch (e) {
      logError('code-analyze/engine', e);
      const msg = e && e.refusal ? 'رفض النموذج تحليل هذا الكود (تصنيف أمان). جرّب ملفًّا آخر أو أزل الجزء الحسّاس.'
        : (pro ? ('تعذّر التحليل: ' + String((e && e.message) || e).slice(0, 160)) : tierLib.FREE_TEXT.busy);
      send({ error: msg });
      finish(); return;
    }
    const parts = splitOutput(text);
    const parsed = extractJson(parts.jsonText);
    if (!parsed) logError('code-analyze/parse', new Error('no JSON in model output (' + String(text || '').length + ' chars, deep=' + parts.deep.length + ')'));
    const report = normalizeReport(parsed, parts.jsonText, parts.deep);
    report.metrics = metrics;
    report.skipped = col.skipped.slice(0, 40);
    report.engine = pro ? 'pro' : 'free';
    report.tier = usage.tier || null;
    send({ report });
    send({ done: true });
    finish();
  } catch (e) {
    logError('code-analyze', e);
    send({ error: 'code-analyze error: ' + String((e && e.message) || e).slice(0, 200) });
    finish();
  }
};

module.exports.__test = { LIMITS, DEFAULT_MODEL, FLAG_DEFS, collectFiles, metricsOf, fileMetrics, buildPrompt, splitOutput, extractJson, normalizeReport, gradeOf, langOf, callPro, callFree, numbered, pickEffort };
