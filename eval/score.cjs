'use strict';
/* v-eval — مقياس جودة المحادثة (طلب المالك ٢٣ سبتمبر «كيف أوصل للعالميّة… ابدأ بالمقياس»).
   تقييم آليّ بلا نموذج حَكَم: كلّ فحص قاعدة نصّيّة على الردّ الحقيقيّ + أحداث البثّ (المصادر، الزمن، الخطأ).
   دالّة نقيّة بلا شبكة — تُختبر في tests/eval-score.test.cjs، ويستعملها scripts/eval-run.mjs. */

const AR = /[ؠ-يٮ-ۓۺ-ۿݐ-ݿ]/g;
const LA = /[A-Za-z]/g;
const NUM_LINE = /^\s*(?:\*\*)?(?:[0-9]{1,2}|[٠-٩]{1,2})[.)\-]\s/;
const BULLET_LINE = /^\s*(?:[-*•]|(?:[0-9]{1,2}|[٠-٩]{1,2})[.)\-])\s/;
const LINK_RE = /\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\)|(?<!\()https?:\/\/[^\s)\]<>"']+/g;
const REFUSAL = /(?:آسف|عذرًا|عذرا|أعتذر)[^\n]{0,80}?(?:لا\s*(?:أستطيع|يمكنني|أقدر)|ما\s*(?:أقدر|أستطيع))|لا\s*(?:أستطيع|يمكنني)\s*(?:المساعدة|مساعدتك)|I\s*(?:can(?:'|no)t|am unable to)\s*help/i;
/* قاعدة ثابتة: لا اسم مزوّد أو نموذج في نصّ يراه المستخدم. */
const PROVIDER_NAME = /\b(?:Claude|Anthropic|OpenAI|ChatGPT|GPT-?\d|Gemini|Groq|DeepSeek|Mistral|Cohere|Llama|Perplexity)\b|كلود|كلاود|أنثروبيك|جيميناي|جيمناي|جي بي تي|غروك|ديب ?سيك|ميسترال/i;
const PHONE = /(?:\+?971|00971|\b05\d)[\d\s-]{7,}/;

function links(text) {
  const out = new Set();
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) out.add((m[1] || m[0]).replace(/[.,،؛)]+$/, ''));
  return [...out];
}
function lines(text) { return String(text || '').split('\n'); }
function numberedCount(text) { return lines(text).filter((l) => NUM_LINE.test(l)).length; }
function listCount(text) { return lines(text).filter((l) => BULLET_LINE.test(l)).length; }
/* نسبة الخطوات المرقّمة التي تحمل رابطًا في سطرها أو في السطرين بعدها قبل الخطوة التالية. */
function stepLinkRatio(text) {
  const ls = lines(text);
  const steps = [];
  ls.forEach((l, i) => { if (NUM_LINE.test(l)) steps.push(i); });
  if (!steps.length) return 0;
  let withLink = 0;
  steps.forEach((s, k) => {
    const end = Math.min(k + 1 < steps.length ? steps[k + 1] : ls.length, s + 3);
    if (links(ls.slice(s, end).join('\n')).length) withLink++;
  });
  return withLink / steps.length;
}
function arabicShare(text) {
  const a = (String(text).match(AR) || []).length;
  const l = (String(text).replace(/```[\s\S]*?```/g, '').replace(/https?:\/\/[^\s)\]]+/g, '').match(LA) || []).length; // v-shot-reply: الرابط ليس لغة الردّ
  return a + l ? a / (a + l) : 0;
}
const has = (text, s) => String(text).toLowerCase().indexOf(String(s).toLowerCase()) !== -1;
const anyOf = (text, alts) => (Array.isArray(alts) ? alts : [alts]).some((s) => has(text, s));

/* v-shot-reply — شكل الردّ على لقطة الشاشة (فئة shot): مقارنة بلا تشكيل ولا علامات، أوّل سطر، الجدول، «أفضل ٣». */
const loose = (s) => String(s || '').replace(/[ً-ْٰـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/[*_`«»"'،,.:؛!؟?()[\]]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const nonEmpty = (text) => lines(text).map((l) => l.trim()).filter(Boolean);
const firstLine = (text) => (nonEmpty(text)[0] || '').replace(/^[\s#>*_\-•\p{Extended_Pictographic}️]+/u, '');
const INTRO = /^(?:في\s+(?:هذه\s+)?(?:الصورة|اللقطة|الشاشة)|(?:هذه|الصورة|اللقطة|الشاشة)\s+(?:الصورة|اللقطة|الشاشة|صفحة|شاشة|تعرض|تظهر|توضح)|(?:تظهر|يظهر|تعرض|أرى|ارى)\s)/;
const REASON = /\S\s*(?:—|–|-|:)\s*\S.{3,}/;
function tableOf(text) {
  const ls = lines(text);
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
  for (let i = 0; i + 1 < ls.length; i++) {
    if (!/\|/.test(ls[i]) || !/^\s*\|?\s*:?-{3,}/.test(ls[i + 1])) continue;
    const rows = [];
    for (let j = i + 2; j < ls.length && /\|/.test(ls[j]); j++) rows.push(cells(ls[j]));
    return { head: cells(ls[i]), rows };
  }
  return null;
}
/* البنود المرقّمة بعد آخر سطر «أفضل ٣» مباشرةً — سطر غير مرقّم (سبب نزل لسطر ثانٍ) يقطعها. */
function top3Of(text) {
  const ls = nonEmpty(text);
  const k = ls.findLastIndex((l) => /أفضل\s*(?:3|٣|ثلاث)/.test(l));
  if (k === -1) return null;
  const items = [];
  for (let j = k + 1; j < ls.length && NUM_LINE.test(ls[j]); j++) items.push(ls[j].replace(NUM_LINE, ''));
  return items;
}

/* يعيد قائمة الفحوص: { name, pass, detail } — الفحوص العامّة لكلّ سؤال + فحوص السؤال نفسه. */
function checkReply(question, run) {
  const text = String((run && run.text) || '');
  const c = (question && question.checks) || {};
  const out = [];
  const add = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });

  add('ردّ', text.trim().length >= 2 && !(run && run.error), run && run.error ? run.error : text.length + ' حرف');
  add('بلا اسم مزوّد', !PROVIDER_NAME.test(text), (text.match(PROVIDER_NAME) || [''])[0]);
  if (question.cat !== 'code') add('عربيّ', arabicShare(text) >= 0.5, Math.round(arabicShare(text) * 100) + '%');
  const odd = (text.replace(/```[\s\S]*?```/g, '').match(/\*\*/g) || []).length % 2 === 1;
  add('ماركداون سليم', !odd && !/\]\s+\(https?:/.test(text), odd ? '** مفتوحة' : '');

  if (c.numbered) add('خطوات مرقّمة ≥' + c.numbered, numberedCount(text) >= c.numbered, numberedCount(text));
  if (c.listItems) add('بنود ≥' + c.listItems, listCount(text) >= c.listItems, listCount(text));
  if (c.maxListItems) add('بنود ≤' + c.maxListItems, listCount(text) <= c.maxListItems, listCount(text));
  if (c.noList) add('بلا قائمة', listCount(text) <= 2, listCount(text));
  if (c.minLinks) add('روابط ≥' + c.minLinks, links(text).length >= c.minLinks, links(text).length);
  if (c.stepLinks) { const r = stepLinkRatio(text); add('رابط تحت الخطوة ≥' + Math.round(c.stepLinks * 100) + '%', r >= c.stepLinks, Math.round(r * 100) + '%'); }
  if (c.sourcesOrLinks) { const n = ((run && run.sources) || 0) + links(text).length; add('مصادر أو روابط ≥' + c.sourcesOrLinks, n >= c.sourcesOrLinks, n); }
  if (c.hasDigits) add('أرقام', /[0-9٠-٩]/.test(text));
  if (c.mustIncludeAny) c.mustIncludeAny.forEach((alts) => add('يذكر: ' + [].concat(alts)[0], anyOf(text, alts)));
  if (c.mustIncludeAll) c.mustIncludeAll.forEach((alts) => add('يذكر: ' + [].concat(alts)[0], anyOf(text, alts)));
  if (c.minChars) add('طول ≥' + c.minChars, text.length >= c.minChars, text.length);
  if (c.maxChars) add('طول ≤' + c.maxChars, text.length <= c.maxChars, text.length);
  if (c.maxWords) { const w = text.trim().split(/\s+/).filter(Boolean).length; add('كلمات ≤' + c.maxWords, w <= c.maxWords, w); }
  if (c.noRefusal) add('بلا رفض', !REFUSAL.test(text.slice(0, 300)));
  if (c.table) add('جدول', /\|[^\n]*\|/.test(text) && /\|\s*:?-{3,}/.test(text));
  if (c.codeBlock) add('صندوق كود', /```/.test(text));
  if (c.arabic && question.cat === 'code') add('عربيّ', arabicShare(text) >= 0.5);
  if (c.noPhone) add('بلا رقم خاصّ', !PHONE.test(text));
  if (c.firstLineAny) add('أوّل سطر جواب', c.firstLineAny.some((s) => loose(firstLine(text)).includes(loose(s))), firstLine(text).slice(0, 60));
  if (c.noIntro) add('بلا وصف للّقطة', !INTRO.test(firstLine(text)), firstLine(text).slice(0, 40));
  if (c.maxVerbatim) { const n = c.maxVerbatim.texts.filter((s) => loose(text).includes(loose(s))).length; add('نصوص اللقطة ≤' + c.maxVerbatim.max, n <= c.maxVerbatim.max, n); }
  if (c.tableCols) { const t = tableOf(text); add('أعمدة: ' + c.tableCols.join(' · '), !!t && c.tableCols.every((col, i) => loose(t.head[i]).includes(loose(col))), t ? t.head.join(' | ') : 'بلا جدول'); }
  if (c.tableRows) { const t = tableOf(text); add('صفوف ≥' + c.tableRows, !!t && t.rows.length >= c.tableRows, t ? t.rows.length : 0); }
  if (c.top3) { const it = top3Of(text); add('أفضل ٣ بسبب في سطر', !!it && it.length === 3 && it.every((l) => REASON.test(l)), it ? it.length : 'بلا سطر «أفضل ٣»'); }
  if (c.maxLines) { const n = nonEmpty(text).length; add('أسطر ≤' + c.maxLines, n <= c.maxLines, n); }
  if (c.phrase) add('العبارة: ' + c.phrase, loose(text).includes(loose(c.phrase)));
  if (c.linkIncludes) add('رابط ' + c.linkIncludes, links(text).some((u) => u.includes(c.linkIncludes)), links(text).join(' '));
  return out;
}

function scoreQuestion(question, run) {
  const checks = checkReply(question, run);
  const passed = checks.filter((x) => x.pass).length;
  return { id: question.id, cat: question.cat, score: Math.round((100 * passed) / checks.length), checks,
    firstDeltaMs: (run && run.firstDeltaMs) || 0, totalMs: (run && run.totalMs) || 0, tier: (run && run.tier) || '', model: (run && run.model) || '' };
}

const median = (xs) => { const a = xs.filter((x) => x > 0).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; };

function summarize(results) {
  const cats = {};
  results.forEach((r) => { (cats[r.cat] = cats[r.cat] || []).push(r.score); });
  const byCat = {};
  Object.keys(cats).forEach((k) => { byCat[k] = Math.round(cats[k].reduce((a, b) => a + b, 0) / cats[k].length); });
  const overall = results.length ? Math.round(results.reduce((a, r) => a + r.score, 0) / results.length) : 0;
  return { overall, byCat, medianFirstDeltaMs: median(results.map((r) => r.firstDeltaMs)), medianTotalMs: median(results.map((r) => r.totalMs)), count: results.length };
}

/* مقارنة بالتشغيل السابق: ما تحسّن وما تراجع — التراجع هو ما يجب أن يوقف أيّ نشر. */
function compare(prev, cur) {
  if (!prev || !Array.isArray(prev.results)) return null;
  const old = new Map(prev.results.map((r) => [r.id, r.score]));
  const up = [], down = [];
  cur.results.forEach((r) => {
    if (!old.has(r.id)) return;
    const d = r.score - old.get(r.id);
    if (d > 0) up.push({ id: r.id, from: old.get(r.id), to: r.score });
    if (d < 0) down.push({ id: r.id, from: old.get(r.id), to: r.score });
  });
  return { overallFrom: prev.summary && prev.summary.overall, overallTo: cur.summary.overall, up, down };
}

const CAT_AR = { guide: 'الإرشاد بين المواقع', live: 'معلومات حيّة', knowledge: 'معرفة عامّة', format: 'الترتيب والتنسيق', dialect: 'اللهجة والحوار', code: 'البرمجة', math: 'الحساب', memory: 'الذاكرة', writing: 'الكتابة', honesty: 'الصدق', shot: 'لقطات الشاشة' };

function report(cur, cmp) {
  const s = cur.summary;
  const L = [];
  L.push('# مقياس جودة المحادثة — ' + cur.date);
  L.push('');
  L.push('المزوّد: **' + cur.provider + '** · الطبقة: **' + (cur.tier || 'مشترك') + '** · الأسئلة: ' + s.count);
  L.push('');
  L.push('## الدرجة الكلّيّة: ' + s.overall + ' / 100' + (cmp && cmp.overallFrom != null ? '  (السابق ' + cmp.overallFrom + ')' : ''));
  L.push('');
  L.push('| الفئة | الدرجة |');
  L.push('|---|---|');
  Object.keys(s.byCat).forEach((k) => L.push('| ' + (CAT_AR[k] || k) + ' | ' + s.byCat[k] + ' |'));
  L.push('');
  L.push('السرعة: أوّل حرف ' + (s.medianFirstDeltaMs / 1000).toFixed(1) + 'ث (الوسيط) · الردّ كاملًا ' + (s.medianTotalMs / 1000).toFixed(1) + 'ث');
  if (cmp) {
    L.push('');
    L.push('## مقارنة بالتشغيل السابق');
    L.push('- تحسّن: ' + (cmp.up.length ? cmp.up.map((x) => x.id + ' ' + x.from + '→' + x.to).join('، ') : 'لا شيء'));
    L.push('- **تراجع:** ' + (cmp.down.length ? cmp.down.map((x) => x.id + ' ' + x.from + '→' + x.to).join('، ') : 'لا شيء'));
  }
  L.push('');
  L.push('## الأسئلة التي لم تكتمل');
  cur.results.filter((r) => r.score < 100).sort((a, b) => a.score - b.score).forEach((r) => {
    L.push('- **' + r.id + '** (' + r.score + '): ' + r.checks.filter((x) => !x.pass).map((x) => x.name + (x.detail ? ' [' + x.detail + ']' : '')).join(' · '));
  });
  return L.join('\n') + '\n';
}

module.exports = { checkReply, scoreQuestion, summarize, compare, report, links, stepLinkRatio, numberedCount, listCount, arabicShare };
