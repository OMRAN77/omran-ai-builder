// tests/video-modes-by-result.test.cjs — v-video-modes-by-result (١٠ أكتوبر ٢٠٢٦): قائمة «وضع الإنشاء» بالنتيجة لا بالمحرّك
// (لقطة المالك: أربعة أوضاع بنتيجة واحدة ← «سريع بصوت» / «جودة عالية» = المحرّك الأساسيّ بقراره / «سينمائيّ بصوت وكلام» /
// «ممثّل يتكلّم» / «بدون ذكاء»)، الافتراضيّ صار الاقتصاديّ، Omni خرج من القائمة بلا حذف كوده، ووضع «الدمج» صار مربّع
// «مقدّمة وخاتمة بتوقيعك» يلتفّ حول لقطة أيّ محرّك ذكاء. ولا اسم مزوّد في نصّ يراه المستخدم (قاعدة المالك الثابتة).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const CORE = read('js/partials-core.js');
const VIDEO = read('js/app-11-video.js');
const STUDIO = read('js/video.js');
const DICT = read('js/app-03-i18n-data.js');
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
const KEYS = ['videoModeMinimax', 'videoModeRunwayOnly', 'videoModeVeo', 'videoModeActor', 'videoModeCanvasOnly', 'videoModeOmni', 'videoWrapSignature', 'videoMakerLongMinutesNote', 'videoFilmModeOnly'];
const PROVIDER = /\b(runway|veo|google|minimax|hailuo|gemini|omni)\b|جوجل|رانوي|রানওয়ে|रनवे/i;

function extractBlock(source, startNeedle) {
  const a = source.indexOf(startNeedle);
  assert.ok(a >= 0, 'بداية الكتلة: ' + startNeedle);
  const braceStart = source.indexOf('{', a);
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.equal(depth, 0, 'قوس المطابقة لم يُغلق: ' + startNeedle);
  return source.slice(a, i + 1);
}
const OPTS = [...CORE.matchAll(/<option value="(\w+)"( selected)? data-i18n="(videoMode\w+)">([^<]*)<\/option>/g)]
  .map((m) => ({ v: m[1], sel: !!m[2], key: m[3], text: m[4].trim() }));

test('١. القائمة: خمسة أوضاع بالنتيجة بهذا الترتيب، «سريع» الافتراضيّ، والقيم الداخليّة كما هي؛ Omni والدمج خارجها وكودهما باقٍ', () => {
  assert.deepEqual(OPTS.map((o) => o.v), ['minimax', 'runway', 'veo', 'actor', 'canvas']);
  assert.deepEqual(OPTS.filter((o) => o.sel).map((o) => o.v), ['minimax'], 'الافتراضيّ الجديد هو الاقتصاديّ (كان runway)');
  assert.deepEqual(OPTS.map((o) => o.text), ['⚡ سريع بصوت', '🎬 جودة عالية', '🔊 سينمائيّ بصوت وكلام', '🗣️ ممثل يتكلم — لهجة إماراتية', '🎨 بدون ذكاء (مجّانيّ)']);
  for (const o of OPTS) assert.doesNotMatch(o.text, PROVIDER, o.v + ': اسم مزوّد في القائمة');
  // Omni محفوظ لا محذوف: المسار والخادم وفرع العميل والترجمة — إرجاعه سطر <option> واحد
  assert.ok(!CORE.includes('value="omni"') && !CORE.includes('value="hybrid"'));
  assert.ok(fs.existsSync(path.join(root, 'api/_lib/omni-create.js')));
  assert.ok(read('api/video.js').includes("case 'omni-create'"));
  assert.ok(VIDEO.includes("if(creationMode === 'omni'){") && VIDEO.includes("if(creationMode === 'hybrid'){"), 'فرعا omni وhybrid في العميل باقيان');
  assert.ok(VIDEO.includes('async function runHybrid('));
});

test('٢. الـ١٤ لغة: المفاتيح موجودة، videoModeHybrid صار videoWrapSignature، ولا اسم مزوّد في أسماء الأوضاع ولا ملاحظة الدقائق ولا رسالة الفيلم', () => {
  for (const l of ['ar', 'en']) {
    const block = DICT.slice(DICT.indexOf('  ' + l + ': {'), DICT.indexOf('\n  ' + (l === 'ar' ? 'en' : 'fr') + ': {') > 0 ? DICT.indexOf('\n  ' + (l === 'ar' ? 'en' : 'fr') + ': {') : undefined);
    for (const k of KEYS) {
      const m = DICT.match(new RegExp('^\\s*' + k + ': ([\'"])(.*)\\1,?\\s*$', 'mg')) || [];
      assert.equal(m.length, 2, k + ' في القاموس (ar+en) — وجد ' + m.length);
      for (const line of m) assert.doesNotMatch(line.replace(/^\s*\w+: /, ''), PROVIDER, k + ': ' + line.trim().slice(0, 80));
    }
    assert.ok(block.length > 0);
  }
  assert.ok(!/videoModeHybrid/.test(DICT), 'videoModeHybrid حُذف من القاموس (صار videoWrapSignature)');
  for (const lg of LANGS) {
    const src = read('i18n/' + lg + '.js');
    const ctx = { I18N: {}, window: {} };
    vm.runInNewContext(src, ctx);
    const d = ctx.I18N[lg];
    assert.ok(d, lg + ': القاموس يُجمَّع');
    for (const k of KEYS) {
      assert.ok(typeof d[k] === 'string' && d[k].trim(), lg + ' ← ' + k);
      assert.doesNotMatch(d[k], PROVIDER, lg + ' ← ' + k + ': ' + d[k].slice(0, 80));
    }
    assert.ok(!('videoModeHybrid' in d), lg + ': videoModeHybrid باقٍ');
    // شريط الأقسام يقصّ الاسم عند أوّل « — »: الأسماء القصيرة بلا شرطة كي لا يضيع «بصوت»
    for (const k of ['videoModeMinimax', 'videoModeRunwayOnly', 'videoModeVeo', 'videoModeCanvasOnly']) assert.doesNotMatch(d[k], /\s[—–-]\s/, lg + ' ← ' + k + ' فيه شرطة تقصّ الاسم في التبويب');
  }
});

test('٣. شريط الأقسام (js/video.js): ترتيب القائمة نفسه بلا omni/hybrid، وأسماء التبويبات من نصوص الخيارات كاملة', () => {
  assert.ok(STUDIO.includes("var TABS=['trend','minimax','runway','veo','actor','canvas','clean'];"));
  const ico = STUDIO.match(/var ICO=.*?;/)[0];
  const short = STUDIO.match(/function short\(t\)\{.*?\}/)[0];
  const tabLabel = extractBlock(STUDIO, 'function tabLabel(v){');
  const sel = { options: OPTS.map((o) => ({ value: o.v, textContent: o.text })) };
  const ctx = { id: (x) => (x === 'videoMakerMode' ? sel : null), L: (k) => k };
  vm.runInNewContext(ico + '\n' + short + '\n' + tabLabel + '\nthis.tabLabel = tabLabel;', ctx);
  assert.deepEqual(['minimax', 'runway', 'veo', 'actor', 'canvas'].map(ctx.tabLabel), ['سريع بصوت', 'جودة عالية', 'سينمائيّ بصوت وكلام', 'ممثل يتكلم', 'بدون ذكاء']);
  // مربّع «مقدّمة وخاتمة بتوقيعك» يُطوى مع التوقيع في «خيارات إضافية»
  assert.ok(STUDIO.includes("id('videoMakerWrapRow'),id('videoMakerSignatureRow')"));
});

test('٤. مربّع «مقدّمة وخاتمة بتوقيعك»: يظهر لأوضاع الذكاء وحدها، وصفّ التوقيع يظهر معه حين يُفعَّل أو في «بدون ذكاء»', () => {
  assert.match(CORE, /<label id="videoMakerWrapRow"[^>]*display:none/);
  assert.ok(CORE.includes('<input type="checkbox" id="videoMakerWrapToggle">'));
  assert.ok(CORE.includes('data-i18n="videoWrapSignature"'));
  const a = VIDEO.indexOf("  const wrapRow = document.getElementById('videoMakerWrapRow');");
  const b = VIDEO.indexOf('  modeEl.onchange = updateModeUI;');
  assert.ok(a > 0 && b > a);
  assert.ok(VIDEO.includes('  if(wrapToggle) wrapToggle.onchange = updateModeUI;'));
  const els = { videoMakerWrapRow: { style: {} }, videoMakerWrapToggle: { checked: false } };
  const narrLab = { style: {} }; /* v-video-durations: التعليق الصوتيّ يظهر حيث يُدمج وحده */
  const narrationToggle = { checked: true, closest: () => narrLab, onchange: null };
  const ctx = { document: { getElementById: (id) => els[id] || null }, modeEl: { value: 'minimax' }, signatureRow: { style: {} }, syncFilmHeroRow: () => {}, narrationToggle };
  vm.runInNewContext(VIDEO.slice(a, b) + '\nthis.update = updateModeUI; this.want = wantCanvasWrap;', ctx);
  for (const [mode, row, sig] of [['minimax', 'flex', 'none'], ['runway', 'flex', 'none'], ['veo', 'flex', 'none'], ['actor', 'none', 'none'], ['canvas', 'none', 'flex']]) {
    ctx.modeEl.value = mode; ctx.update();
    assert.equal(els.videoMakerWrapRow.style.display, row, mode + ': المربّع');
    assert.equal(ctx.signatureRow.style.display, sig, mode + ': التوقيع بلا تفعيل');
    assert.equal(ctx.want(), false, mode + ': بلا تفعيل لا التفاف');
    assert.equal(narrLab.style.display, { runway: '', canvas: '' }[mode] === '' ? '' : 'none', mode + ': التعليق الصوتيّ بلا التفاف');
  }
  assert.equal(narrationToggle.checked, false, 'وضع لا يُدمج فيه التعليق يُطفئه');
  els.videoMakerWrapToggle.checked = true;
  for (const [mode, sig, want] of [['minimax', 'flex', true], ['runway', 'flex', true], ['veo', 'flex', true], ['actor', 'none', false], ['canvas', 'flex', false]]) {
    ctx.modeEl.value = mode; ctx.update();
    assert.equal(ctx.signatureRow.style.display, sig, mode + ': التوقيع مع التفعيل');
    assert.equal(ctx.want(), want, mode + ': الالتفاف مع التفعيل');
    assert.equal(narrLab.style.display, (want || mode === 'canvas') ? '' : 'none', mode + ': التعليق الصوتيّ مع الالتفاف');
  }
});

test('٥. الالتفاف بعد نجاح كلّ محرّك ذكاء (الاقتصاديّ/الأساسيّ/السينمائيّ لا الممثّل)، مستخرج من runHybrid، ويحفظ صوت اللقطة', () => {
  assert.ok(VIDEO.includes('async function wrapWithCanvas(mainSrc, text, ratio, signature, wantNarration, narrationVal){'));
  assert.equal((VIDEO.match(/await wrapWithCanvas\(/g) || []).length, 4, 'runHybrid + الاقتصاديّ + السينمائيّ + الأساسيّ');
  assert.ok(VIDEO.includes("if(wantCanvasWrap()){ await wrapWithCanvas(vurl, text, ratio, signature, wantNarration, (narrationText.value || '').trim()); return; }"), 'الاقتصاديّ');
  assert.ok(VIDEO.includes("if(creationMode === 'veo' && wantCanvasWrap()){ await wrapWithCanvas(vblob, text, ratio, signature, wantNarration, (narrationText.value || '').trim()); return; }"), 'السينمائيّ لا الممثّل');
  assert.ok(VIDEO.includes("if(wantCanvasWrap()){ await wrapWithCanvas(finalIsBlob ? finalSrc : playerUrl, text, ratio, signature, false, ''); return; }"), 'الأساسيّ (التعليق دُمج قبله فلا يُعاد)');
  // runHybrid (القيمة hybrid المحفوظة) = لقطة الأساسيّ ثمّ الالتفاف نفسه
  const hybrid = extractBlock(VIDEO, 'async function runHybrid(');
  assert.ok(hybrid.indexOf('createSceneWithRetry(') > 0 && hybrid.indexOf('await wrapWithCanvas(mainUrl,') > hybrid.indexOf('createSceneWithRetry('));
  assert.ok(!hybrid.includes('recordCanvasClip('), 'المقدّمة والخاتمة انتقلتا إلى wrapWithCanvas');
  const wrap = extractBlock(VIDEO, 'async function wrapWithCanvas(');
  assert.equal((wrap.match(/recordCanvasClip\(/g) || []).length, 2, 'مقدّمة وخاتمة');
  assert.ok(wrap.includes("await ffmpeg.writeFile('main.mp4', await fetchFile(mainSrc));"));
  assert.ok(wrap.includes('makeWatermarkPng(signature, ratio)') && wrap.includes("'[v0][v1][v2]concat=n=3:v=1:a=0[outv]'"));
  /* صوت اللقطة (سريع بصوت / سينمائيّ) كان يضيع في الدمج (a=0) — يُؤخَّر ثانيتَي المقدّمة ويُدمج، ولقطة بلا صوت تبقى صامتة */
  assert.ok(wrap.includes("'[1:a]adelay=2000|2000[a]'") && wrap.includes("if(rc === 0) finalName = 'final_a.mp4';") && wrap.includes("await ffmpeg.readFile(finalName)"));
  const wrapAt = VIDEO.indexOf('async function wrapWithCanvas(');
  const useAt = VIDEO.indexOf('await wrapWithCanvas(vurl,');
  assert.ok(wrapAt < useAt, 'الدالّة معرّفة قبل أوّل استعمال في التوزيع');
});

test('٦. الفيلم: «جودة عالية» و«سينمائي» وحدهما؛ «سريع» (كان يصنع مشاهده بمحرّك «جودة عالية» صامتًا — v-video-durations) و«بدون ذكاء» و«ممثّل» يُوقَفون برسالة', () => {
  const needle = "        if(creationMode !== 'runway' && !filmUseVeo){";
  const block = extractBlock(VIDEO, needle);
  assert.ok(VIDEO.includes("const filmUseVeo = (creationMode === 'veo');"), 'الاقتصاديّ ليس مسلك السينمائيّ');
  for (const [mode, pass] of [['minimax', false], ['runway', true], ['veo', true], ['canvas', false], ['actor', false]]) {
    const statuses = [];
    const ctx = { creationMode: mode, filmUseVeo: mode === 'veo', setStatus: (s) => statuses.push(s), btnGenerate: { disabled: true }, window: {}, bT: (a) => a };
    const r = vm.runInNewContext('(function(){ ' + block + ' return "passed"; })()', ctx);
    assert.equal(r, pass ? 'passed' : undefined, mode);
    if (!pass) assert.match(statuses[0], /لم يُخصم شيء/, mode);
  }
  assert.match(block, /أوضاع الذكاء فقط \(جودة عالية \/ سينمائيّ\)/, 'رسالة البوّابة بأسماء القائمة الجديدة (بلا «سريع» — خرج من الفيلم)');
});

test('٧. لا اسم مزوّد في رسائل صانع الفيديو التي لُمست (قاعدة المالك)، والوسوم مرفوعة، والحزمة مبنيّة', () => {
  for (const s of ["'🔒 Veo 3 مقتصر", 'جاري الإرسال إلى Google Veo 3', 'Sending to Google Veo 3', "'فشل Veo.'", "' (Veo 3)'", 'Veo 3 يولّد', 'Veo 3 is limited', 'Veo failed.']) assert.ok(!VIDEO.includes(s), 'اسم مزوّد باقٍ: ' + s);
  assert.ok(VIDEO.includes("'🔒 المحرّك السينمائيّ مقتصر على حساب المالك حاليًا.'"), 'صياغة v-no-provider-names (main) بعد الدمج');
  const html = read('index.html');
  /* الوسوم تُقرأ من index.html لا تُثبَّت حرفيًّا (سقّاطة البنية vPinTests في main): partials-core رُفع ٦٥٦←٦٥٧ وvideo.js ٤٣٩←٤٤٠ في هذا الفرع، وmain يرفعهما بعدها */
  const vTag = (re) => Number((html.match(re) || [])[1]);
  assert.ok(vTag(/partials-core\.js\?v=(\d+)/) >= 657 && vTag(/\/js\/video\.js\?v=(\d+)/) >= 440, 'وسوم partials-core ≥ ٦٥٧ وvideo.js ≥ ٤٤٠');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('async function wrapWithCanvas(') && bundle.includes("if(creationMode !== 'runway' && !filmUseVeo){"), 'شغّل npm run bundle');
});

console.log('✓ video-modes-by-result: القائمة بالنتيجة — سريع بصوت (افتراضيّ) · جودة عالية · سينمائيّ · ممثّل · بدون ذكاء، ومربّع المقدّمة والخاتمة');
