'use strict';
/* v-img-honest + v-img-mix (المالك ٢٣ سبتمبر ٢٠٢٦، لقطتان: «أنماط الصور» رجعت كما هي وتحتها «تمّ تغيير جميع
   الوجوه» — «أوّل شي يقولي شي والتنفيذ صفر… وإذا تقدر خاصيّة دمج بين نانو وGPT، النتيجة وحدة»).
   نداء رؤية واحد لكلّ صورة (كان التفسير نداءً واحدًا أصلًا — لا زمن إضافيّ): يحكم هل نُفّذ الطلب في كلّ مرشّح
   (done/partial/not_done) بما يُرى فقط، ومعه قياس البكسل من image-diff دليلًا موضوعيًّا، ثمّ يختار الأفضل بين
   مرشّحين (الوضع المزدوج)، ويكتب التقرير للمختار. درس v-lanes مكتوب في القاعدة: التنفيذ أوّلًا، ولا يُفضَّل مرشّح
   لأنّه أقرب للمصدر — الحكم القديم فعل ذلك فألغى التعديل نفسه. عطب/مهلة = { ok:false } والمتّصل يكمل بلا حكم. */
const VERIFY_MODEL = 'gemini-flash-latest';
const { compareImages, looksUnchanged, describeChange, visionCopy, decodeImage } = require('./image-diff');

const VERDICTS = ['done', 'partial', 'not_done'];

/* تلميح النيّة: ما الذي يُعدّ «منفّذًا» في هذا النوع من الطلبات تحديدًا */
function intentHint(f) {
  const o = f || {};
  if (o.personSwap) return 'This is a PERSON SWAP: it is executed only if EVERY person in the source is replaced by a clearly DIFFERENT new person (different face and hair; same role, age group, pose and outfit type), no two new people look alike, and every written word (titles, captions, labels) stays letter-for-letter identical. The same faces as the source = not_done; some faces replaced = partial.';
  if (o.textEdit) return 'This is a TEXT edit: check the exact letters of the requested words, and that other text is unchanged and unbroken (Arabic letters must be correct).';
  if (o.restyle || o.reimagine || o.elevate) return 'This asks for a visibly NEW look (style, idea or a clearly stronger design). A result that is practically the same picture as the source = not_done.';
  if (o.merge) return 'This MERGES several reference images: every reference subject must appear, each person with the same identity as in their own photo.';
  return '';
}

function reportInstr(isEdit) {
  return isEdit
    ? 'Write "report" in the SAME language and dialect as the user\'s request (Gulf Arabic if they wrote Gulf Arabic): (1) one short sentence stating exactly what changed, describing only what is truly visible in the result; (2) if any part of the request is NOT visible or came out different, say so plainly in one short sentence (never claim it was done); (3) one question asking whether they like it and offering TWO concrete next options specific to this image, in the shape "هل أعجبتك؟ ولا أسوي لك … أو …؟". No markdown, max 55 words.'
    : 'Write "report" in the SAME language and dialect as the user\'s request (Gulf Arabic if they wrote Gulf Arabic): FIRST line exactly "📋 تفسير الفكرة", then 3 to 4 lines each starting with "• " describing only what is actually visible in the picked image: the main elements and the idea behind it. Then check it against the request: if any requested element is missing or different, add one line starting with "⚠️ " naming it honestly (never claim something is in the image when it is not). End with one short line offering one concrete tweak. No fluff, max 75 words.';
}

/* الأجزاء المرسلة لنموذج الرؤية — دالّة صافية قابلة للاختبار */
function buildVerifyParts(o) {
  const cands = o.candidates || [];
  const n = cands.length;
  const letters = 'ABC';
  const parts = [{ text: 'The user asked, verbatim: "' + String(o.request || '').slice(0, 600) + '".' }];
  if (o.source && o.source.b64) {
    parts.push({ text: 'SOURCE (the picture the user sent):' });
    parts.push({ inlineData: { mimeType: o.source.mime || 'image/jpeg', data: o.source.b64 } });
  }
  cands.forEach(function (c, i) {
    parts.push({ text: 'RESULT ' + letters[i] + ':' + (c.evidence ? ' ' + c.evidence : '') });
    parts.push({ inlineData: { mimeType: c.mime || 'image/png', data: c.b64 } });
  });
  const hint = intentHint(o.intent);
  parts.push({ text:
    'You are a strict, honest checker. Judge ONLY what you can SEE in each result — never assume the request was done because it was asked. ' +
    (hint ? hint + ' ' : '') +
    'For EACH result give a verdict: "done" (everything asked is clearly visible), "partial" (only part of it), or "not_done" (the request is not visible' + (o.source ? ', e.g. the result is practically the same picture as the source' : '') + ').\n' +
    (n > 1 ? 'Then pick the best result: the executed request comes first (done > partial > not_done); among equals prefer the one that keeps what should stay unchanged (text letter-for-letter, layout) and looks most finished and realistic. NEVER prefer a result just because it is closer to the source — when a change was requested, looking like the source is a failure.\n' : '') +
    reportInstr(!!o.source) + '\n' +
    (o.source ? 'Also classify the REQUEST itself as "scope": "big" if doing it must visibly change a large part of the picture (replacing people or faces, a new style, a new scene or layout), else "small" (a local tweak: one object, a colour, a word).\n' : '') +
    'Also rate the written text in the picked result as "text": "none" (no writing at all), "ok" (every word correct' + (o.source ? ' and identical to the source wherever it should stay' : '') + ') or "broken" (any garbled, misspelled or changed letter — check Arabic letter by letter).\n' +
    'Reply with JSON only, no code fence: {"verdicts": [' + cands.map(function () { return '"done|partial|not_done"'; }).join(', ') + '], "pick": ' + (n > 1 ? '<index of the best result, 0 = A>' : '0') + (o.source ? ', "scope": "big|small"' : '') + ', "text": "none|ok|broken", "missing": "<short English note of what is missing in the picked result, or empty>", "report": "<the report>"}' });
  return parts;
}

/* قراءة الردّ بتسامح: JSON داخل سياج أو نصّ، والأحكام المجهولة = partial (لا نتّهم ولا نصدّق) */
function parseVerdict(txt, n) {
  const s = String(txt || '').trim();
  if (!s) return null;
  let j = null;
  const m = s.match(/\{[\s\S]*\}/);
  try { j = JSON.parse(m ? m[0] : s); } catch (e) { j = null; } /* guard-ok — ردّ غير JSON = لا حكم */
  if (!j || typeof j !== 'object') return null;
  const raw = Array.isArray(j.verdicts) ? j.verdicts : (j.verdict ? [j.verdict] : []);
  const verdicts = [];
  for (let i = 0; i < n; i++) {
    const v = String(raw[i] || '').toLowerCase().replace(/[\s-]+/g, '_');
    verdicts.push(VERDICTS.indexOf(v) >= 0 ? v : (/not/.test(v) ? 'not_done' : 'partial'));
  }
  let pick = parseInt(j.pick, 10);
  if (!Number.isFinite(pick) || pick < 0 || pick >= n) pick = rankCandidates(verdicts.map(function (v) { return { verdict: v }; }));
  const report = typeof j.report === 'string' ? j.report.trim().slice(0, 600) : '';
  const scope = /^big$/i.test(String(j.scope || '').trim()) ? 'big' : (/^small$/i.test(String(j.scope || '').trim()) ? 'small' : '');
  const text = /^(none|ok|broken)$/i.test(String(j.text || '').trim()) ? String(j.text).trim().toLowerCase() : '';
  return { verdicts, pick, report, scope, text, missing: typeof j.missing === 'string' ? j.missing.slice(0, 200) : '' };
}

/* ترتيب حتميّ بلا نموذج: الثابت بالبكسل خاسر دائمًا، ثمّ done > partial/مجهول > not_done، والتساوي للأسبق (المسار الأساسيّ) */
function rankCandidates(cands) {
  const score = function (c) { if (!c || c.unchanged) return -1; return c.verdict === 'done' ? 3 : (c.verdict === 'not_done' ? 0 : (c.verdict === 'partial' ? 2 : 1)); };
  let best = 0;
  for (let i = 1; i < cands.length; i++) if (score(cands[i]) > score(cands[best])) best = i;
  return best;
}

/* الفشل الذي يستحقّ محرّكًا آخر: الناتج نفس المصدر بالبكسل، أو الحكم «لم يُنفَّذ» */
function isFailed(c) { return !!(c && (c.unchanged || c.verdict === 'not_done')); }

/* opts: { apiKey, request, source:{b64,mime}|null, candidates:[{b64,mime,evidence?}], intent, timeoutMs }
   → { ok:true, verdicts, pick, scope, text, report, missing } | { ok:false, reason } */
async function verifyAndReport(opts) {
  const o = opts || {};
  const cands = (o.candidates || []).filter(function (c) { return c && c.b64; }).slice(0, 3);
  if (!o.apiKey || !cands.length) return { ok: false, reason: 'no_input' };
  if (String(process.env.IMAGE_CAPTION || 'on').toLowerCase() === 'off') return { ok: false, reason: 'disabled' };
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + VERIFY_MODEL + ':generateContent?key=' + o.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs || 22000),
      /* تفكير قصير مقصود: بلا تفكير (v-flash-nothink) صدّق النموذج الطلب وادّعى تغيير وجوه لم تتغيّر. السقف 3000
         يترك للنصّ مكانه بعد ميزانيّة التفكير (درس v-flash-nothink: التفكير كان يلتهم السقف فيعود فارغًا). */
      body: JSON.stringify({ contents: [{ parts: buildVerifyParts(Object.assign({}, o, { candidates: cands })) }], generationConfig: { temperature: 0.2, maxOutputTokens: 3000, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 768 } } }),
    });
    if (!r.ok) { console.error('[image-verify] http=' + r.status); return { ok: false, reason: 'http_' + r.status }; }
    const d = await r.json().catch(function () { return null; });
    const txt = (((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('');
    const v = parseVerdict(txt, cands.length);
    if (!v) { console.error('[image-verify] unparsable finish=' + ((((d || {}).candidates || [])[0] || {}).finishReason || '?')); return { ok: false, reason: 'unparsable' }; }
    return Object.assign({ ok: true }, v);
  } catch (e) { return { ok: false, reason: String(e && e.name || 'error') }; }
}

/* تسوية المرشّحين قبل الإرسال (maha-image ← deliver). لا صورة تخرج قبل أن تُقاس:
   ١) البكسل: هل تغيّر الناتج عن المصدر؟ (لا يرى الطلب، فلا يُخدع به). ٢) نداء رؤية واحد يحكم ويكتب التقرير، ومعه القياس.
   ٣) الحاكم قرأ الطلب «كبيرًا» (كاشف النيّة قد يفلت منه تبديل) والبكسل «نفس الصورة» = لم يُنفَّذ مهما قال.
   لم يُنفَّذ أو ثابت = المحرّك الآخر مرّة واحدة (altFn) ويُعاد الحكم على الأحياء معًا؛ ثابت في الكلّ و honest = { ok:false }
   (مصارحة ٤٢٢ عند المتّصل). honest=false (الخام/IMAGE_VERIFY=off/الدعاء) = لا محرّك آخر ولا رفض، تقرير صادق فقط.
   o: { first, altFn, polishFn, apiKey, request, source:{b64,mime}|null, measurable, expectBig, intent, honest, skipJudge, deadlineOk }
   → { ok:true, best, report, engine, tried } | { ok:false, tried } */
async function settleCandidates(o) {
  const pool = [].concat(o.first).filter(function (c) { return c && c.b64; });
  const srcDec = (o.source && o.measurable) ? decodeImage(o.source.b64) : null;
  const srcVis = o.source ? (visionCopy(srcDec || o.source.b64, 1280) || o.source) : null;
  const measure = function (c) {
    if ('unchanged' in c) return;
    const dec = decodeImage(c.b64);
    c.cmp = (srcDec && dec) ? compareImages(srcDec, dec) : null;
    c.unchanged = looksUnchanged(c.cmp, !!o.expectBig);
    c.evidence = describeChange(c.cmp);
    c.vis = dec ? visionCopy(dec, 1280) : null;
  };
  const check = async function (list) {
    if (o.skipJudge) return { best: list[0], report: '' };
    const v = await verifyAndReport({ apiKey: o.apiKey, request: o.request, source: srcVis, intent: o.intent,
      candidates: list.map(function (c) { return { b64: (c.vis || c).b64, mime: (c.vis || c).mime, evidence: c.evidence }; }) });
    if (!v.ok) return { best: list[rankCandidates(list)], report: '' };
    list.forEach(function (c, i) { c.verdict = v.verdicts[i]; });
    let flipped = false;
    if (v.scope === 'big') list.forEach(function (c) { if (!c.unchanged && looksUnchanged(c.cmp, true)) { c.unchanged = true; c.verdict = 'not_done'; flipped = true; } });
    /* مراجعة: المختار قلبه القياس «ثابتًا» ⇒ اختياره وتقريره («تمّ…») لا يُصدَّقان — حكم جديد على الأحياء إن وُجدوا (نداء واحد
       في هذا المسار النادر)، وإلّا بلا تقرير (المتّصل يصارح بـ٤٢٢، أو الخام يُرسل بلا ادّعاء). */
    if (flipped && list[v.pick].unchanged) {
      const rest = list.filter(function (c) { return !c.unchanged; });
      return rest.length ? check(rest) : { best: list[v.pick], report: '', text: v.text };
    }
    return { best: list[v.pick], report: v.report, text: v.text };
  };
  const alive = function () { return pool.filter(function (c) { return !c.unchanged; }); };
  pool.forEach(measure);
  let out = alive().length ? await check(alive()) : null;
  if (o.honest && o.altFn && pool.every(isFailed) && (!o.deadlineOk || o.deadlineOk())) {
    let alt = null;
    try { alt = await o.altFn(); } catch (e) { alt = null; } /* guard-ok — فشل المحرّك الآخر = نكمل بما عندنا */
    if (alt && alt.b64) { measure(alt); pool.push(alt); if (!alt.unchanged) out = await check(alive()); }
  }
  /* v-img-mix خيار «أ»: المختار من برو ونُفّذ وفيه كتابة (أو لم يُعرف) = GPT يصلّح الكتابة وحدها، ثمّ حكم بين الاثنين */
  if (o.polishFn && out && out.best && !out.best.unchanged && out.best.verdict !== 'not_done' && out.text !== 'none' && !/openai/.test(out.best.engine || '') && (!o.deadlineOk || o.deadlineOk())) {
    const base = out.best;
    let pol = null;
    try { pol = await o.polishFn(base); } catch (e) { pol = null; } /* guard-ok — فشل التلميع = نرسل ناتج برو كما هو */
    if (pol && pol.b64) { measure(pol); pool.push(pol); if (!pol.unchanged) out = await check([base, pol]); }
  }
  const tried = pool.map(function (c) { return c.engine + ':' + (c.unchanged ? 'same' : (c.verdict || '?')); }).join(',');
  if (!alive().length && o.honest) return { ok: false, tried: tried };
  if (!out) out = await check(pool.slice(0, 1));
  const best = out.best || pool[0];
  return { ok: true, best: best, report: out.report, engine: best.engine + (pool.length > 1 ? '[' + tried + ']' : ''), tried: tried };
}

module.exports = { verifyAndReport, settleCandidates, buildVerifyParts, parseVerdict, rankCandidates, isFailed, intentHint, VERIFY_MODEL };
